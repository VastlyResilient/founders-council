import { randomBytes } from "node:crypto";
import { hashPassword } from "../server/auth.js";

// Prints a COUNCIL_ACCOUNTS entry: npm run account -- <Name> <password>
const [name, password] = process.argv.slice(2);
if (!name || !password || !/^[A-Za-z0-9]+$/.test(name)) {
  console.error("Usage: npm run account -- <Name (letters and digits)> <password>");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
console.log(`${name}:${salt}:${hashPassword(password, salt).toString("hex")}`);
