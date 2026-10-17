import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Every browser gets an anonymous visitor id in a signed, httpOnly cookie.
 * Sessions and memory are scoped to it, so visitors never see each other's data.
 */
const COOKIE = "fc_visitor";
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
const SECRET =
  process.env.COUNCIL_VISITOR_SECRET || process.env.COUNCIL_SESSION_SECRET || createHmac("sha256", "fc-visitor").update(process.env.DATABASE_URL ?? "").digest("hex");

declare module "express-serve-static-core" {
  interface Request {
    visitorId: string;
  }
}

const sign = (id: string) => createHmac("sha256", SECRET).update(id).digest("base64url");

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function verify(token: string | null) {
  if (!token) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export function visitor(req: Request, res: Response, next: NextFunction) {
  let id = verify(readCookie(req, COOKIE));
  if (!id) {
    id = randomUUID();
    res.cookie(COOKIE, `${id}.${sign(id)}`, { httpOnly: true, secure: req.secure, sameSite: "lax", maxAge: MAX_AGE_MS, path: "/" });
  }
  req.visitorId = id;
  next();
}

/* ---- Daily message limits, to protect the API budget ---- */
const PER_VISITOR = Number(process.env.COUNCIL_DAILY_LIMIT ?? 40);
const PER_IP = Number(process.env.COUNCIL_DAILY_IP_LIMIT ?? 120);
const counts = new Map<string, number>();
let day = new Date().toISOString().slice(0, 10);

export function chatLimit(req: Request, res: Response, next: NextFunction) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    counts.clear();
    day = today;
  }
  const v = `v:${req.visitorId}`;
  const ip = `ip:${req.ip ?? "unknown"}`;
  if ((counts.get(v) ?? 0) >= PER_VISITOR || (counts.get(ip) ?? 0) >= PER_IP) {
    return res.status(429).json({ error: `You've reached today's limit of ${PER_VISITOR} messages. The Council will be back tomorrow.` });
  }
  counts.set(v, (counts.get(v) ?? 0) + 1);
  counts.set(ip, (counts.get(ip) ?? 0) + 1);
  next();
}
