import "./env.js";
import express from "express";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { config } from "./env.js";
import { explainQuestion, runCouncilTurn, type CouncilEvent } from "./council.js";
import { corpusStats } from "./retrieve.js";
import { authRequired, currentUser, login, logout, requireAuth } from "./auth.js";
import { chatLimit, visitor } from "./visitor.js";
import { getFounderProfile, migrateFounders } from "./founders.js";
import {
  createConversation,
  deleteConversation,
  findConversationByQuote,
  deleteTake,
  getConversation,
  getTakes,
  listConversations,
  migrate,
  type Mode,
} from "./store.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));
app.use("/api", visitor);

app.get("/api/session", (req, res) => {
  const user = currentUser(req);
  res.json({ authRequired, authenticated: !authRequired || Boolean(user), user: user?.name ?? null });
});
app.post("/api/login", login);
app.post("/api/logout", logout);
app.use("/api", requireAuth);

const MODES: Mode[] = ["counsel", "grill", "ask", "act", "board"];

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, library: await corpusStats().catch(() => null), model: config.councilModel });
});

app.get("/api/conversations", async (req, res) => {
  try {
    res.json(await listConversations(req.visitorId));
  } catch {
    res.status(500).json({ error: "Couldn't load past sessions." });
  }
});

app.get("/api/conversations/:id", async (req, res) => {
  try {
    const convo = await getConversation(req.params.id, req.visitorId);
    if (!convo) return res.status(404).json({ error: "Conversation not found." });
    res.json(convo);
  } catch {
    res.status(400).json({ error: "Invalid conversation id." });
  }
});

app.delete("/api/conversations/:id", async (req, res) => {
  try {
    await deleteConversation(req.params.id, req.visitorId);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Invalid conversation id." });
  }
});

app.get("/api/patterns", (_req, res) => {
  res.type("text/plain").send(readFileSync(path.resolve(process.cwd(), "server/knowledge/cheat-sheet.md"), "utf8"));
});

app.get("/api/founders/:name", async (req, res) => {
  try {
    res.json(await getFounderProfile(String(req.params.name)));
  } catch (error) {
    console.warn("founder profile failed:", (error as Error).message);
    res.status(500).json({ error: "Couldn't load this founder right now. Try again in a moment." });
  }
});

app.get("/api/memory", async (req, res) => {
  try {
    res.json(await getTakes(req.visitorId, typeof req.query.conversation === "string" ? req.query.conversation : null));
  } catch {
    res.status(500).json({ error: "Couldn't load memory." });
  }
});
app.delete("/api/memory/:id", async (req, res) => {
  try {
    await deleteTake(req.params.id, req.visitorId);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Invalid memory id." });
  }
});

/** Answers to "Ask me first" questions, cleaned up. */
function readAnswers(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 6)
    .map((x) => ({ q: String(x?.q ?? "").trim().slice(0, 300), a: String(x?.a ?? "").trim().slice(0, 2000) }))
    .filter((x) => x.q && x.a);
}

const explained = new Map<string, { simple: string; examples: string[] }>();

app.post("/api/explain", async (req, res) => {
  const question = String(req.body?.question ?? "").trim().slice(0, 300);
  if (!question) return res.status(400).json({ error: "No question to explain." });
  try {
    const convo = await getConversation(String(req.body?.conversationId ?? ""), req.visitorId);
    if (!convo) return res.status(404).json({ error: "Conversation not found." });
    const key = `${convo.id}:${question}`;
    if (!explained.has(key)) {
      if (explained.size > 2000) explained.clear();
      explained.set(key, await explainQuestion(convo, question));
    }
    res.json(explained.get(key));
  } catch (error) {
    console.warn("explain failed:", (error as Error).message);
    res.status(500).json({ error: "Couldn't simplify this one. Try again." });
  }
});

app.post("/api/chat", chatLimit, async (req, res) => {
  const answers = readAnswers(req.body?.answers);
  const text = answers.length
    ? `My answers to your questions:\n\n${answers.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n\n")}`
    : String(req.body?.message ?? "").trim();
  const mode: Mode = MODES.includes(req.body?.mode) ? req.body.mode : "counsel";
  if (!text) return res.status(400).json({ error: "Write a message first." });
  if (text.length > 8000) return res.status(400).json({ error: "Keep messages under 8,000 characters." });

  let convo;
  try {
    convo = req.body?.conversationId ? await getConversation(String(req.body.conversationId), req.visitorId) : null;
  } catch {
    return res.status(400).json({ error: "Invalid conversation id." });
  }
  // A reply to an earlier Council line that arrives without its conversation continues that conversation,
  // so the Council always has the full history behind the line being asked about.
  const quoted = typeof req.body?.replyTo === "string" ? req.body.replyTo.trim() : "";
  if (!convo && quoted) convo = await findConversationByQuote(req.visitorId, quoted).catch(() => null);
  convo ??= createConversation(text);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (event: CouncilEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const replyTo = typeof req.body?.replyTo === "string" ? req.body.replyTo.trim().slice(0, 1200) : "";
    await runCouncilTurn(convo, text, mode, emit, controller.signal, req.visitorId, {
      replyTo: replyTo || undefined,
      expand: Boolean(req.body?.expand) && Boolean(replyTo),
      answers,
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error("council turn failed:", error);
      emit({ type: "error", message: describeError(error) });
    }
  } finally {
    res.end();
  }
});

function describeError(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 401) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  if (status === 429) return "The Council is rate limited right now. Wait a moment and send again.";
  if (status && status >= 500) return "Anthropic's API had a server error. Send the message again.";
  return "The Council couldn't answer. Send the message again.";
}

const dist = path.resolve(process.cwd(), "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

Promise.all([migrate(), migrateFounders()])
  .catch((error) => console.error("Couldn't create the Council tables:", error.message))
  .finally(() => {
    app.listen(config.port, () => console.log(`Founders Council on http://localhost:${config.port}${authRequired ? " (sign-in required)" : ""}`));
  });
