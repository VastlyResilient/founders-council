import pg from "pg";
import "./env.js";

const url = process.env.DATABASE_URL;

export const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      max: 6,
    })
  : null;
