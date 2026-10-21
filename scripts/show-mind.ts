import "../server/env.js";
import { pool } from "../server/db.js";
const { rows } = await pool!.query("select name, lens, jsonb_array_length(episodes) eps, length(mind) n, mind from council_founder_minds where name ilike $1 order by eps desc limit 1", [`%${process.argv[2]}%`]);
const m = rows[0]; console.log(`${m.name} (${m.eps} episodes, ${m.n} chars)\nLens: ${m.lens}\n`); console.log(m.mind.slice(0, Number(process.argv[3] ?? 2500)));
const c = await pool!.query("select count(*)::int n, sum(length(mind))::int chars from council_founder_minds"); console.log("\nTOTAL", c.rows[0]);
await pool!.end();
