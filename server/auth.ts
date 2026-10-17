import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const ACCESS_CODE = process.env.COUNCIL_ACCESS_CODE ?? "";
const SECRET = process.env.COUNCIL_SESSION_SECRET || createHmac("sha256", "founders-council").update(ACCESS_CODE).digest("hex");
const COOKIE = "fc_session";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export const authRequired = ACCESS_CODE.length > 0;

function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function readCookie(req: Request) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** True when the browser still holds a valid session from the access-code era. */
export function hasValidSession(req: Request) {
  const token = readCookie(req);
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

export function isAuthenticated(req: Request) {
  if (!authRequired) return true;
  const token = readCookie(req);
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

const attempts = new Map<string, { count: number; resetAt: number }>();

export function login(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= 10) {
    return res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
  }
  const code = String(req.body?.code ?? "").trim();
  if (!authRequired || !safeEqual(code, ACCESS_CODE)) {
    attempts.set(ip, entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + 15 * 60_000 });
    return res.status(401).json({ error: "That access code isn't right." });
  }
  attempts.delete(ip);
  const expires = String(now + MAX_AGE_MS);
  res.cookie(COOKIE, `${expires}.${sign(expires)}`, {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
  res.json({ ok: true });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: "Enter your access code to use the Council.", auth: true });
}
