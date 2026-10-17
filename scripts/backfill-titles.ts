/** One-off: give older sessions a summarized title. Usage: npx tsx scripts/backfill-titles.ts */
import "../server/env.js";
import { titleSession } from "../server/council.js";
import { migrate, untitledConversations } from "../server/store.js";
import { pool } from "../server/db.js";

await migrate();
const rows = await untitledConversations(100);
for (const row of rows) {
  await titleSession({ id: row.id, messages: row.messages }, row.visitor_id).catch((e) => console.warn(row.id, e.message));
}
const { rows: after } = await pool!.query("select title from council_conversations where id = any($1)", [rows.map((r) => r.id)]);
console.log(`titled ${rows.length}:`, after.map((r) => r.title));
await pool?.end();
