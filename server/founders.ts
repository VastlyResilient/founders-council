import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "./env.js";
import { pool } from "./db.js";
import { searchTranscripts } from "./retrieve.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null, baseURL: config.anthropicBaseURL });

export const FounderProfile = z.object({
  name: z.string(),
  knownFor: z.string(),
  founded: z.array(z.string()),
  era: z.string(),
  story: z.string(),
  principles: z.array(z.object({ title: z.string(), line: z.string() })),
  lens: z.string(),
  episodes: z.array(z.string()),
});
export type FounderProfile = z.infer<typeof FounderProfile>;

const VOICE_LIBRARY = readFileSync(path.resolve(process.cwd(), "server/knowledge/voices.md"), "utf8");

function voiceSection(name: string) {
  const start = VOICE_LIBRARY.indexOf(`## ${name}`);
  if (start < 0) return "";
  const next = VOICE_LIBRARY.indexOf("\n## ", start + 3);
  return VOICE_LIBRARY.slice(start, next < 0 ? undefined : next);
}

export async function migrateFounders() {
  await pool?.query(`
    create table if not exists council_founders (
      key text primary key,
      data jsonb not null,
      created_at timestamptz not null default now()
    );
  `);
}

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const inFlight = new Map<string, Promise<FounderProfile>>();

/** A short, sourced profile of a founder; generated once from the transcripts, then cached. */
export async function getFounderProfile(rawName: string): Promise<FounderProfile> {
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) throw new Error("Name too short.");
  const key = keyOf(name);

  const cached = await pool?.query<{ data: FounderProfile }>(`select data from council_founders where key = $1`, [key]);
  if (cached?.rows[0]) return cached.rows[0].data;

  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      generate(name)
        .then(async (profile) => {
          await pool?.query(`insert into council_founders (key, data) values ($1, $2::jsonb) on conflict (key) do nothing`, [key, JSON.stringify(profile)]);
          return profile;
        })
        .finally(() => inFlight.delete(key)),
    );
  }
  return inFlight.get(key)!;
}

async function generate(name: string): Promise<FounderProfile> {
  const sources = await searchTranscripts(`${name}: who they were, what they founded and built, how they worked`, 8, 2).catch(() => []);
  const excerpts = sources.map((s, i) => `<excerpt n="${i + 1}" episode="${s.title.replace(/"/g, "'")}">\n${s.text.trim()}\n</excerpt>`).join("\n\n");

  const response = await client.messages.parse({
    model: config.councilModel,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(FounderProfile) },
    messages: [
      {
        role: "user",
        content: `Write a short profile of ${name} for someone tapping their name in a founders advisor app. Simple, plain words; informative, not flowery.

Fields:
- name: the name they're commonly known by (e.g. "Jeff Bezos", "Sam Walton"), not their full legal name.
- knownFor: one line, under 15 words, on what they're known for.
- founded: the companies, products or institutions they founded or built (1 to 4 items, short names).
- era: years active and place, e.g. "1945–1992, Arkansas".
- story: 2 or 3 short sentences on what they did and how — the turning point that matters.
- principles: exactly 3 principles they lived by, each a 2–4 word title and one short line.
- lens: one sentence on how to use their way of thinking on your own problem today.
- episodes: up to 3 titles of the episodes below that are about them (exact titles), or an empty list.

Ground everything in the excerpts and notes below. Where they don't cover a field, use only widely documented facts. Never invent quotes, numbers or events; leave out what you aren't sure of.

${voiceSection(name) ? `<voice_notes>\n${voiceSection(name)}\n</voice_notes>\n\n` : ""}<excerpts>
${excerpts || "(no matching excerpts)"}
</excerpts>`,
      },
    ],
  });
  const profile = response.parsed_output;
  if (!profile) throw new Error("Couldn't build that profile.");
  const titles = new Set(sources.map((s) => s.title));
  return { ...profile, principles: profile.principles.slice(0, 3), episodes: profile.episodes.filter((t) => titles.has(t)).slice(0, 3) };
}
