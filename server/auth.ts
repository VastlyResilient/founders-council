import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { adoptVisitor } from "./store.js";

/**
 * Named accounts. COUNCIL_ACCOUNTS holds "Name:salt:hash" entries separated by commas,
 * where hash = scrypt(password, salt, 32) in hex. Passwords themselves are never stored.
 * Make an entry with: npm run account -- <Name> <password>
 */
type Account = { key: string; name: string; salt: string; hash: Buffer };

const ACCOUNTS = new Map<string, Account>();
for (const entry of (process.env.COUNCIL_ACCOUNTS ?? "").split(",")) {
  const [name, salt, hash] = entry.trim().split(":");
  if (!name || !salt || !hash) continue;
  const key = keyOf(name);
  ACCOUNTS.set(key, { key, name, salt, hash: Buffer.from(hash, "hex") });
}

const SECRET = process.env.COUNCIL_SESSION_SECRET || createHmac("sha256", "founders-council").update(process.env.COUNCIL_ACCOUNTS ?? "").digest("hex");
const COOKIE = "fc_session";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export const authRequired = ACCOUNTS.size > 0;

declare module "express-serve-static-core" {
  interface Request {
    userName?: string;
  }
}

function keyOf(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32);
}

function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function readCookie(req: Request) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The signed-in account, if the session cookie is valid. */
export function currentUser(req: Request): Account | null {
  const token = readCookie(req);
  if (!token) return null;
  const [key, expires, signature] = token.split(".");
  if (!key || !expires || !signature || Number(expires) < Date.now()) return null;
  if (!safeEqual(signature, sign(`${key}.${expires}`))) return null;
  return ACCOUNTS.get(key) ?? null;
}

export const accountVisitorId = (account: Account) => `user:${account.key}`;

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function login(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= 10) {
    return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
  }
  const account = ACCOUNTS.get(keyOf(String(req.body?.username ?? "")));
  const password = String(req.body?.password ?? "");
  const ok = account && timingSafeEqual(hashPassword(password, account.salt), account.hash);
  if (!account || !ok) {
    attempts.set(ip, entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + 15 * 60_000 });
    return res.status(401).json({ error: "That username or password isn't right." });
  }
  attempts.delete(ip);
  // Sessions started on this browser before signing in move into the account.
  await adoptVisitor(req.visitorId, accountVisitorId(account)).catch((error) => console.warn("adopt failed:", error.message));
  const expires = String(now + MAX_AGE_MS);
  res.cookie(COOKIE, `${account.key}.${expires}.${sign(`${account.key}.${expires}`)}`, {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
  res.json({ ok: true, user: account.name });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
}

/** Signed-in requests use the account's id, so sessions follow the person across devices. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authRequired) return next();
  const account = currentUser(req);
  if (!account) return res.status(401).json({ error: "Sign in to use the Council.", auth: true });
  req.visitorId = accountVisitorId(account);
  req.userName = account.name;
  next();
}
