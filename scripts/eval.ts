/**
 * Behaviour regression suite for the Council. Replays real conversations against a running server
 * (default http://localhost:8790) and has a separate model grade each reply against explicit criteria.
 *
 *   npx tsx scripts/eval.ts            run every case
 *   npx tsx scripts/eval.ts reply      run cases whose name contains "reply"
 *
 * Uses the Dan test account and deletes the conversations it creates.
 */
import "../server/env.js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../server/env.js";
import { pool } from "../server/db.js";

const BASE = process.env.EVAL_BASE ?? "http://localhost:8790";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null, baseURL: config.anthropicBaseURL });
let cookie = "";
const created = new Set<string>();

type Reply = { text: string; replies: string[]; conversationId: string };

async function login() {
  const res = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "Dan", password: process.env.EVAL_PASSWORD ?? "Phllpns:2" }) });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error("login failed");
}

async function say(message: string, opts: { mode?: string; conversationId?: string | null; replyTo?: string } = {}): Promise<Reply> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message, mode: opts.mode ?? "counsel", conversationId: opts.conversationId ?? null, replyTo: opts.replyTo }),
  });
  const body = await res.text();
  const done = body.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6))).find((e) => e.type === "done");
  if (!done) throw new Error(`no reply: ${body.slice(0, 300)}`);
  created.add(done.conversationId);
  return { text: done.message.text, replies: done.message.replies ?? [], conversationId: done.conversationId };
}

const Grade = z.object({ pass: z.boolean(), reason: z.string() });
async function grade(transcript: string, criteria: string[]) {
  const r = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 1500,
    output_config: { format: zodOutputFormat(Grade) },
    messages: [{ role: "user", content: `Grade the LAST reply from the COUNCIL in this conversation. It passes only if it meets EVERY criterion. Judge ONLY the listed criteria; ignore anything else you might like or dislike about the reply.\n\nCriteria:\n${criteria.map((c) => `- ${c}`).join("\n")}\n\n<conversation>\n${transcript}\n</conversation>\n\nGive pass and a one-sentence reason.` }],
  });
  return r.parsed_output ?? { pass: false, reason: "grader returned nothing" };
}

/** Checks every quoted phrase and number in a reply against the full transcripts. */
async function verifyClaims(text: string) {
  const quotes = [...text.matchAll(/["“]([^"”]{12,160})["”]/g)].map((m) => m[1]);
  const numbers = [...text.matchAll(/\$?\d[\d,.]*\s?(?:million|billion|%|percent)?/gi)].map((m) => m[0].trim()).filter((n) => n.replace(/\D/g, "").length >= 3);
  const WORDS = "two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand";
  const spelled = [...text.matchAll(new RegExp(`\\b(?:${WORDS})\\s+[a-z]+`, "gi"))].map((m) => m[0]);
  const lines: string[] = [];
  for (const claim of [...quotes, ...numbers, ...spelled]) {
    // plain substring search (no regex), on words only, so "$" and punctuation can't break the match
    const probe = claim.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
    const { rows } = await pool!.query("select 1 from transcript_chunks where regexp_replace(text, '[^A-Za-z0-9 ]', ' ', 'g') ilike '%' || $1 || '%' limit 1", [probe]);
    lines.push(`${rows.length ? "VERIFIED in transcripts" : "NOT FOUND in transcripts"}: ${claim}`);
  }
  return lines.length ? lines.join("\n") : "(no quotes or numbers to verify)";
}

const plain = (t: string) => t.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_m, f, s) => s ?? f);
type Case = { name: string; run: () => Promise<{ transcript: string; criteria: string[]; check?: string | null }> };

const BUSINESS = "I want to make a company in North Haven called Absolute Transportation the best luxury chauffeur company in North Haven.";

const CASES: Case[] = [
  {
    name: "reply-explain-everything (the reported failure)",
    async run() {
      const a = await say(BUSINESS);
      const line = plain(a.text).split("\n\n").find((p) => /account|ride/i.test(p)) ?? plain(a.text).split("\n\n")[1];
      const b = await say("What do you mean by this", { conversationId: a.conversationId, replyTo: line });
      const c = await say("Everything", { conversationId: a.conversationId });
      return {
        transcript: `PERSON: ${BUSINESS}\nCOUNCIL: ${plain(a.text)}\nPERSON (replying to "${line}"): What do you mean by this\nCOUNCIL: ${plain(b.text)}\nPERSON: Everything\nCOUNCIL: ${plain(c.text)}`,
        criteria: [
          "The last reply explains the quoted idea fully and concretely for a luxury chauffeur business in North Haven",
          "It does not ask which part they mean, and does not ask them to repeat or paste anything",
          "It never says it guessed or that it lost or lacks the conversation/what they are referring to (naming one specific business fact it still needs, while answering anyway, is fine)",
        ],
      };
    },
  },
  {
    name: "reply-without-conversation (the bug's root cause)",
    async run() {
      const a = await say(BUSINESS);
      const line = plain(a.text).split("\n\n")[1];
      const b = await say("What do you mean by this", { conversationId: null, replyTo: line });
      return {
        transcript: `PERSON (replying to "${line}"): What do you mean by this\nCOUNCIL: ${plain(b.text)}`,
        criteria: ["The reply explains the quoted line in the context of a chauffeur business", "It does not ask what business or industry they are in (asking about their stage or numbers is fine)"],
        check: b.conversationId === a.conversationId ? null : "the reply started a new conversation instead of continuing the original one",
      };
    },
  },
  {
    name: "pasted-developer-error",
    async run() {
      const msg = "The dev server failed to start with the following error:\n\nDev servers are not available for this session.\n\nFix, then call preview_start to start the server.";
      const a = await say(msg);
      return {
        transcript: `PERSON: ${msg}\nCOUNCIL: ${plain(a.text)}`,
        criteria: [
          "It doesn't invent a fix it can't perform or pretend to run anything",
          "It briefly says this looks like it was meant for a different tool and offers to help with their business",
          "It is short (under about 80 words) and does not claim it guessed",
        ],
      };
    },
  },
  {
    name: "greeting",
    async run() {
      const a = await say("hey");
      return { transcript: `PERSON: hey\nCOUNCIL: ${plain(a.text)}`, criteria: ["One or two short lines", "No founders, quotes or advice", "Invites them to share what they're building or stuck on"] };
    },
  },
  {
    name: "vague-request",
    async run() {
      const a = await say("help me grow");
      return {
        transcript: `PERSON: help me grow\nCOUNCIL: ${plain(a.text)}`,
        criteria: ["Does not give confident advice as if it already knew their business", "Asks for the facts it needs rather than assuming them", "Does not invent facts about their business"],
      };
    },
  },
  {
    name: "founder-fact-grounded",
    async run() {
      const q = "How did Sam Walton keep tabs on competitors?";
      const a = await say(q);
      const evidence = await verifyClaims(plain(a.text));
      return {
        transcript: `PERSON: ${q}\nCOUNCIL: ${plain(a.text)}\n\nCLAIM CHECK (searched against all 740 episode transcripts):\n${evidence}`,
        criteria: ["Answers with a concrete Walton practice", "Every item in the claim check is marked VERIFIED (anything NOT FOUND counts as invented)", "Turns it into something the person can apply"],
      };
    },
  },
  {
    name: "decision-offers-board",
    async run() {
      const q = "I run a bakery doing 20k a month. Should I raise prices 30% or keep them and push volume?";
      const a = await say(q);
      return {
        transcript: `PERSON: ${q}\nCOUNCIL: ${plain(a.text)}\nSUGGESTED REPLIES: ${a.replies.join(" | ")}`,
        criteria: ["Engages with the decision directly"],
        check: a.replies.includes("Convene the board") ? null : "no 'Convene the board' chip on a real decision",
      };
    },
  },
];

async function cleanup() {
  for (const id of created) await fetch(`${BASE}/api/conversations/${id}`, { method: "DELETE", headers: { cookie } }).catch(() => undefined);
}

async function main() {
  await login();
  const filter = process.argv[2];
  const cases = CASES.filter((c) => !filter || c.name.includes(filter));
  let passed = 0;
  for (const c of cases) {
    try {
      const { transcript, criteria, check } = await c.run();
      const g = await grade(transcript, criteria);
      const ok = g.pass && !check;
      if (ok) passed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}\n      ${check ?? g.reason}`);
      if (!ok && process.env.EVAL_VERBOSE) console.log(transcript.split("\n").map((l) => "        " + l).join("\n"));
    } catch (e) {
      console.log(`ERROR ${c.name}: ${(e as Error).message}`);
    }
  }
  console.log(`\n${passed}/${cases.length} passed`);
  await cleanup();
  await pool?.end();
}
main();
