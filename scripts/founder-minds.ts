/**
 * Builds a "founder mind" for every founder covered in the transcripts: how they actually thought,
 * not what they said. Two batch passes (50% cheaper, results within ~24h, usually much sooner):
 *
 *   1. read  : Sonnet reads each unique episode in full and extracts each founder's beliefs, decisions
 *              (with reasoning and outcome), mental models, mistakes and where their approach breaks.
 *   2. write : Opus combines everything about one founder into a single mind.
 *   3. store : minds are saved to council_founder_minds with an embedding for retrieval.
 *
 *   npx tsx scripts/founder-minds.ts prepare        build the episode list (deduplicated)
 *   npx tsx scripts/founder-minds.ts read           submit the read batch
 *   npx tsx scripts/founder-minds.ts write          collect reads, submit the write batch
 *   npx tsx scripts/founder-minds.ts store          collect minds and save them
 *   npx tsx scripts/founder-minds.ts status         show batch progress
 * Add --sample N to any step to run on N episodes only (a cheap trial).
 */
import "../server/env.js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../server/env.js";
import { pool } from "../server/db.js";
import { embed } from "../server/retrieve.js";

const DIR = path.resolve("media/out/minds");
mkdirSync(DIR, { recursive: true });
const file = (n: string) => path.join(DIR, n);
const load = <T>(n: string, fallback: T): T => (existsSync(file(n)) ? JSON.parse(readFileSync(file(n), "utf8")) : fallback);
const save = (n: string, v: unknown) => writeFileSync(file(n), JSON.stringify(v, null, 1));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null, baseURL: config.anthropicBaseURL });

const READ_MODEL = "claude-sonnet-5-5";
const WRITE_MODEL = "claude-opus-5-5";
const sampleArg = process.argv.indexOf("--sample");
const SAMPLE = sampleArg > 0 ? Number(process.argv[sampleArg + 1]) : 0;
const tag = SAMPLE ? `sample${SAMPLE}-` : "";

/* ---------------------------- 1. episodes ---------------------------- */

type Episode = { id: string; title: string };
async function prepare() {
  const dup: Record<string, string> = JSON.parse(readFileSync("media/out/ep-duplicates.json", "utf8"));
  const { rows } = await pool!.query<Episode>(
    `select e.id, e.title from episodes e where exists (select 1 from transcript_chunks c where c.episode_id = e.id and c.source_type = 'transcript') order by e.id`,
  );
  const unique = rows.filter((e) => !dup[e.id]); // a YouTube copy of a Spotify episode is read once, via Spotify
  save("episodes.json", unique);
  console.log(`${rows.length} episodes with transcripts, ${unique.length} unique`);
}

async function transcriptOf(id: string) {
  const { rows } = await pool!.query<{ text: string }>(
    `select text from transcript_chunks where episode_id = $1 and source_type = 'transcript' order by chunk_index`,
    [id],
  );
  return rows.map((r) => r.text).join("\n");
}

/* ------------------------------ 2. read ------------------------------ */

const Extraction = z.object({
  founders: z.array(
    z.object({
      name: z.string().describe("The founder's commonly used full name, e.g. 'Sam Walton', 'John D. Rockefeller'"),
      built: z.string().describe("What they built, one line"),
      core_beliefs: z.array(z.object({ belief: z.string(), why: z.string(), shown_by: z.string() })),
      decisions: z.array(z.object({ situation: z.string(), choice: z.string(), reasoning: z.string(), outcome: z.string() })),
      mental_models: z.array(z.object({ model: z.string(), how_they_used_it: z.string() })),
      optimized_for: z.string(),
      refused: z.string(),
      mistakes: z.array(z.object({ mistake: z.string(), what_changed: z.string() })),
      diagnostic_questions: z.array(z.string()).describe("Questions this founder would ask about someone else's business"),
      where_it_breaks: z.string().describe("Conditions under which this founder's approach would fail or mislead"),
    }),
  ),
  cross_founder_lessons: z.array(z.string()).describe("Patterns the host draws across founders in this episode"),
});

const READ_INSTRUCTIONS = `You are building a deep model of how great founders THINK, from a full episode transcript of the Founders podcast (host David Senra).

For every founder the episode genuinely covers (not passing mentions), extract how they thought and decided. Write in your own plain words: principles, reasoning and decisions, not quotations. Capture the WHY behind each belief and choice, the specific decisions that reveal it, what happened, their mistakes and what they changed, and the conditions where their approach would fail.

Be faithful to the transcript: only include what the episode supports. Be specific (names, numbers, situations) where the episode gives them. Keep the whole extraction under about 1,800 words.`;

async function read() {
  const episodes = load<Episode[]>("episodes.json", []).slice(0, SAMPLE || undefined);
  const requests = [];
  for (const ep of episodes) {
    const text = await transcriptOf(ep.id);
    requests.push({
      custom_id: ep.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64),
      params: {
        model: READ_MODEL,
        max_tokens: 8000,
        output_config: { effort: "low" as const, format: zodOutputFormat(Extraction) },
        system: READ_INSTRUCTIONS,
        messages: [{ role: "user" as const, content: `<episode title="${ep.title.replace(/"/g, "'")}">\n${text}\n</episode>` }],
      },
    });
  }
  const ids = Object.fromEntries(episodes.map((e) => [e.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64), e]));
  save(`${tag}read-ids.json`, ids);
  const batch = await client.messages.batches.create({ requests: requests as never });
  save(`${tag}read-batch.json`, { id: batch.id });
  console.log(`read batch ${batch.id}: ${requests.length} episodes submitted`);
}

async function collect(batchFile: string) {
  const { id } = load<{ id: string }>(batchFile, { id: "" });
  const b = await client.messages.batches.retrieve(id);
  if (b.processing_status !== "ended") throw new Error(`batch ${id} still ${b.processing_status}: ${JSON.stringify(b.request_counts)}`);
  const out: Record<string, string> = {};
  const failed: string[] = [];
  let input = 0, output = 0;
  for await (const r of await client.messages.batches.results(id)) {
    if (r.result.type !== "succeeded") { failed.push(r.custom_id); continue; }
    const msg = r.result.message;
    input += msg.usage.input_tokens; output += msg.usage.output_tokens;
    const text = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
    out[r.custom_id] = text;
  }
  return { out, failed, input, output };
}

/* ------------------------------ 3. write ----------------------------- */

const keyOf = (name: string) =>
  name.toLowerCase().replace(/\b[a-z]\.\s*/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const Mind = z.object({
  name: z.string(),
  lens: z.string().describe("One sentence: the core of how this founder saw business"),
  best_for: z.array(z.string()).describe("6-10 kinds of problems or decisions this founder's thinking helps with"),
  mind: z.string().describe("The founder mind in markdown, following the requested sections"),
});

const WRITE_INSTRUCTIONS = `You are writing a "founder mind": a deep, faithful model of how one founder thought, built from extractions of every Founders podcast episode that covers them. A mentor will use it to reason the way this founder would about someone else's business, so it must capture principles and reasoning, not quotes.

Write the mind in markdown with these sections, in plain, specific language:
## How they saw the world: the 4-7 core beliefs that drove everything, each with the why behind it
## How they decided: the recurring decision patterns, illustrated by 3-6 real decisions (situation, choice, reasoning, outcome)
## Mental models: the frameworks they actually used, and how
## What they optimized for, and what they refused to do
## How they would diagnose your business: the questions they'd ask and what they'd look at first
## Mistakes and what they changed
## Where their approach breaks: when following them would mislead someone today
## Contradictions: where sources disagree or they changed over time

Merge duplicates across episodes, keep the strongest evidence, and stay faithful to the extractions. 700-1,100 words.`;

async function write() {
  const { out, failed, input, output } = await collect(`${tag}read-batch.json`);
  console.log(`read results: ${Object.keys(out).length} ok, ${failed.length} failed; ${input} in / ${output} out tokens`);
  const ids = load<Record<string, Episode>>(`${tag}read-ids.json`, {});
  const byFounder: Record<string, { name: string; parts: string[]; episodes: string[] }> = {};
  const parsed: Record<string, unknown> = {};
  for (const [cid, text] of Object.entries(out)) {
    let data: z.infer<typeof Extraction>;
    try { data = JSON.parse(text); } catch { failed.push(cid); continue; }
    parsed[cid] = data;
    for (const f of data.founders) {
      const k = keyOf(f.name);
      if (!k) continue;
      byFounder[k] ??= { name: f.name, parts: [], episodes: [] };
      byFounder[k].parts.push(`<from_episode title="${ids[cid]?.title.replace(/"/g, "'")}">\n${JSON.stringify(f)}\n</from_episode>`);
      byFounder[k].episodes.push(ids[cid]?.title ?? cid);
    }
  }
  save(`${tag}extractions.json`, parsed);
  save(`${tag}founders.json`, Object.fromEntries(Object.entries(byFounder).map(([k, v]) => [k, { name: v.name, episodes: v.episodes }])));
  const requests = Object.entries(byFounder).map(([k, f]) => ({
    custom_id: k.replace(/[^a-z0-9]/g, "_").slice(0, 64),
    params: {
      model: WRITE_MODEL,
      max_tokens: 6000,
      output_config: { effort: "low" as const, format: zodOutputFormat(Mind) },
      system: WRITE_INSTRUCTIONS,
      messages: [{ role: "user" as const, content: `Founder: ${f.name}\nEpisodes covering them: ${f.episodes.length}\n\n${f.parts.join("\n\n")}` }],
    },
  }));
  const batch = await client.messages.batches.create({ requests: requests as never });
  save(`${tag}write-batch.json`, { id: batch.id });
  console.log(`write batch ${batch.id}: ${requests.length} founder minds submitted (${failed.length} episodes unparsed)`);
}

/* ------------------------------ 4. store ----------------------------- */

async function store() {
  const { out, failed, input, output } = await collect(`${tag}write-batch.json`);
  console.log(`write results: ${Object.keys(out).length} ok, ${failed.length} failed; ${input} in / ${output} out tokens`);
  const founders = load<Record<string, { name: string; episodes: string[] }>>(`${tag}founders.json`, {});
  await pool!.query(`
    create table if not exists council_founder_minds (
      key text primary key,
      name text not null,
      lens text not null,
      best_for jsonb not null default '[]'::jsonb,
      mind text not null,
      episodes jsonb not null default '[]'::jsonb,
      embedding vector(1536),
      updated_at timestamptz not null default now()
    );`);
  let n = 0;
  for (const [cid, text] of Object.entries(out)) {
    const m = JSON.parse(text) as z.infer<typeof Mind>;
    const key = Object.keys(founders).find((k) => k.replace(/[^a-z0-9]/g, "_").slice(0, 64) === cid) ?? cid;
    const eps = founders[key]?.episodes ?? [];
    const vector = await embed(`${m.name}. ${m.lens} Best for: ${m.best_for.join("; ")}`);
    await pool!.query(
      `insert into council_founder_minds (key, name, lens, best_for, mind, episodes, embedding, updated_at)
       values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::vector, now())
       on conflict (key) do update set name = excluded.name, lens = excluded.lens, best_for = excluded.best_for,
         mind = excluded.mind, episodes = excluded.episodes, embedding = excluded.embedding, updated_at = now()`,
      [key, m.name, m.lens, JSON.stringify(m.best_for), m.mind, JSON.stringify(eps), `[${vector.join(",")}]`],
    );
    n++;
  }
  console.log(`stored ${n} founder minds`);
}

async function status() {
  for (const f of [`${tag}read-batch.json`, `${tag}write-batch.json`]) {
    const { id } = load<{ id: string }>(f, { id: "" });
    if (!id) continue;
    const b = await client.messages.batches.retrieve(id);
    console.log(f, b.processing_status, JSON.stringify(b.request_counts));
  }
}

const step = process.argv[2];
const steps: Record<string, () => Promise<void>> = { prepare, read, write, store, status };
await (steps[step] ?? (async () => console.log("steps: prepare | read | write | store | status")))();
await pool?.end();
