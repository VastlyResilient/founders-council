import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./env.js";
import { pool } from "./db.js";
import { embed } from "./retrieve.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null, baseURL: config.anthropicBaseURL });

/** A deep model of how one founder thought, distilled from every episode about them (scripts/founder-minds.ts). */
export type FounderMind = { name: string; lens: string; bestFor: string[]; mind: string };

let available: boolean | null = null;
async function hasMinds() {
  if (available !== null) return available;
  const { rows } = await pool!.query(`select to_regclass('public.council_founder_minds') is not null as ok`).catch(() => ({ rows: [{ ok: false }] }));
  available = Boolean(rows[0]?.ok);
  return available;
}

/**
 * The founder minds most relevant to this situation: any founder named in the conversation first,
 * then the closest matches by meaning. Empty until the minds have been built.
 */
export async function findMinds(situation: string, named: string[] = [], limit = 3): Promise<FounderMind[]> {
  if (!pool || !(await hasMinds())) return [];
  const picked: FounderMind[] = [];
  const toMind = (r: { name: string; lens: string; best_for: string[]; mind: string }) => ({ name: r.name, lens: r.lens, bestFor: r.best_for, mind: r.mind });
  for (const name of named.slice(0, limit)) {
    const last = name.split(" ").slice(-1)[0];
    const { rows } = await pool.query(`select name, lens, best_for, mind from council_founder_minds where name ilike $1 order by jsonb_array_length(episodes) desc limit 1`, [`%${last}%`]);
    if (rows[0] && !picked.some((p) => p.name === rows[0].name)) picked.push(toMind(rows[0]));
  }
  if (picked.length < limit) {
    const vector = await embed(situation.slice(0, 4000));
    const { rows } = await pool.query(
      `select name, lens, best_for, mind from council_founder_minds where embedding is not null order by embedding <=> $1::vector limit $2`,
      [`[${vector.join(",")}]`, limit + picked.length],
    );
    for (const r of rows) if (picked.length < limit && !picked.some((p) => p.name === r.name)) picked.push(toMind(r));
  }
  return picked;
}

const Brief = z.object({
  need: z.string().describe("What the person actually needs from this reply, in one sentence"),
  known: z.array(z.string()).describe("Facts about their situation established in the conversation"),
  missing: z.array(z.string()).describe("Facts that would materially change the advice and aren't known yet"),
  real_problem: z.string().describe("The underlying problem beneath what they asked"),
  principles: z
    .array(z.object({ founder: z.string(), principle: z.string(), why_it_applies: z.string() }))
    .describe("2-4 founder principles that genuinely apply to THIS situation, from the founder minds"),
  approach: z.string().describe("How the reply should go: what to say first, what to explain, what to ask (if anything)"),
});
export type Brief = z.infer<typeof Brief>;

/**
 * Thinks before answering: a short private brief on what's needed, what's known and missing, the real
 * problem, and which founder principles apply. The Council writes its reply from this brief.
 */
export async function prepareBrief(input: { conversation: string; message: string; replyTo?: string; notes: string; minds: FounderMind[] }): Promise<Brief | null> {
  const response = await client.messages.parse({
    model: config.briefModel,
    max_tokens: 3000,
    output_config: { effort: "low", format: zodOutputFormat(Brief) },
    system: `You prepare a private brief for a founder mentor before it replies. Read the conversation closely and work out exactly what the person needs. Use the founder minds provided to identify which principles genuinely apply to their specific situation and why, reasoning from each founder's beliefs and decision patterns, not from slogans. Never invent facts about the person; anything not established goes under missing. Missing facts never stop the reply from being useful: the approach must always include one concrete move the person can make, made general when their situation is unknown, followed by at most one question. The conversation history is always available to the mentor, so never plan to restart, re-ask what was already answered, or ask them to repeat themselves.`,
    messages: [
      {
        role: "user",
        content: `<conversation_so_far>\n${input.conversation || "(this is the first message)"}\n</conversation_so_far>\n\n<what_the_council_knows_about_them>\n${input.notes || "(nothing yet)"}\n</what_the_council_knows_about_them>\n\n${input.replyTo ? `They are replying to this line of the mentor's: "${input.replyTo}"\n\n` : ""}<latest_message>\n${input.message}\n</latest_message>\n\n<founder_minds>\n${input.minds.map((m) => `<mind name="${m.name}">\n${m.mind}\n</mind>`).join("\n\n")}\n</founder_minds>`,
      },
    ],
  });
  return response.parsed_output ?? null;
}

export function formatBrief(b: Brief) {
  return `Need: ${b.need}
Real problem: ${b.real_problem}
Known: ${b.known.length ? b.known.join("; ") : "nothing yet"}
Missing: ${b.missing.length ? b.missing.join("; ") : "nothing important"}
Principles that apply:
${b.principles.map((p) => `- ${p.founder}: ${p.principle} (applies because ${p.why_it_applies})`).join("\n")}
Approach: ${b.approach}`;
}
