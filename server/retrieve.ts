import OpenAI from "openai";
import pg from "pg";
import { config } from "./env.js";

export type Source = {
  chunkId: string;
  episodeId: string;
  title: string;
  show: string;
  platform: string;
  url: string | null;
  startSeconds: number | null;
  text: string;
  similarity: number;
};

const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 4,
    })
  : null;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function embed(text: string) {
  if (!openai) throw new Error("OPENAI_API_KEY is required for transcript search.");
  const response = await openai.embeddings.create({ model: config.embeddingModel, input: text.slice(0, 8000) });
  return response.data[0].embedding;
}

function sourceUrl(url: string | null, platform: string, startSeconds: number | null) {
  if (!url) return null;
  if (platform === "youtube" && startSeconds) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}t=${Math.floor(startSeconds)}s`;
  }
  return url;
}

/** Semantic search over every transcript chunk, at most `perEpisode` chunks per episode. */
export async function searchTranscripts(query: string, limit = 10, perEpisode = 2): Promise<Source[]> {
  if (!pool) throw new Error("DATABASE_URL is required for transcript search.");
  const vector = `[${(await embed(query)).map((v) => v.toFixed(8)).join(",")}]`;
  const { rows } = await pool.query(
    `select tc.id as chunk_id, tc.episode_id, e.title,
            coalesce(e.source_channel_or_show_name, e.source_channel) as show,
            coalesce(tc.source_platform, e.source_platform) as platform,
            e.url, tc.start_seconds, tc.text,
            1 - (tc.embedding <=> $1::vector) as similarity
       from transcript_chunks tc
       join episodes e on e.id = tc.episode_id
      where tc.embedding is not null and tc.source_type = 'transcript'
      order by tc.embedding <=> $1::vector
      limit 60`,
    [vector],
  );

  const perEpisodeCount = new Map<string, number>();
  const results: Source[] = [];
  for (const row of rows) {
    const count = perEpisodeCount.get(row.episode_id) ?? 0;
    if (count >= perEpisode) continue;
    perEpisodeCount.set(row.episode_id, count + 1);
    results.push({
      chunkId: row.chunk_id,
      episodeId: row.episode_id,
      title: row.title,
      show: showName(row.show),
      platform: row.platform,
      url: sourceUrl(row.url, row.platform, row.start_seconds),
      startSeconds: row.start_seconds,
      text: row.text,
      similarity: Number(Number(row.similarity).toFixed(4)),
    });
    if (results.length >= limit) break;
  }
  return results;
}

function showName(raw: string | null) {
  if (!raw) return "Founders";
  if (raw === "7jVjHrQJCbgruHkhrFi94A") return "David Senra";
  if (raw === "7txiovdzPARhjm18NwMUYj" || raw.includes("founderspodcast")) return "Founders";
  return raw;
}

export async function corpusStats() {
  if (!pool) return null;
  const { rows } = await pool.query(
    `select count(distinct episode_id)::int as episodes, count(*)::int as chunks
       from transcript_chunks where source_type = 'transcript'`,
  );
  return rows[0] as { episodes: number; chunks: number };
}
