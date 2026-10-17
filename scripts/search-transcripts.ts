/** Usage: npx tsx scripts/search-transcripts.ts "query" [limit] — prints matching transcript passages. */
import "../server/env.js";
import { searchTranscripts } from "../server/retrieve.js";
import { pool } from "../server/db.js";

const query = process.argv[2];
const limit = Number(process.argv[3] ?? 6);
if (!query) throw new Error('Usage: npx tsx scripts/search-transcripts.ts "query" [limit]');
const results = await searchTranscripts(query, limit, 1).catch(async (e) => {
  console.error(e.message);
  return [];
});
for (const r of results) console.log(`\n### ${r.title} [${r.show}]\n${r.text.trim()}`);
await pool?.end();
