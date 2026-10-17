import "./env.js";
import express from "express";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { config } from "./env.js";
import { runCouncilTurn, type CouncilEvent } from "./council.js";
import { corpusStats } from "./retrieve.js";
import { authRequired, hasValidSession, isAuthenticated, login, logout, requireAuth } from "./auth.js";
import { chatLimit, visitor } from "./visitor.js";
import {
  createConversation,
  deleteConversation,
  deleteTake,
  getConversation,
  getTakes,
  listConversations,
  claimUnowned,
  migrate,
  type Mode,
} from "./store.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));
app.use("/api", visitor);

// A browser that logged in with the old access code adopts the sessions and memory saved back then.
let unownedClaimed = false;
app.use("/api", async (req, _res, next) => {
  if (!unownedClaimed && hasValidSession(req)) {
    unownedClaimed = true;
    await claimUnowned(req.visitorId).catch(() => {
      unownedClaimed = false;
    });
  }
  next();
});

app.get("/api/session", (req, res) => res.json({ authRequired, authenticated: isAuthenticated(req) }));
app.post("/api/login", login);
app.post("/api/logout", logout);
app.use("/api", requireAuth);

const MODES: Mode[] = ["counsel", "grill", "ask", "act"];

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

app.get("/api/memory", async (req, res) => {
  try {
    res.json(await getTakes(req.visitorId));
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

app.post("/api/chat", chatLimit, async (req, res) => {
  const text = String(req.body?.message ?? "").trim();
  const mode: Mode = MODES.includes(req.body?.mode) ? req.body.mode : "counsel";
  if (!text) return res.status(400).json({ error: "Write a message first." });
  if (text.length > 8000) return res.status(400).json({ error: "Keep messages under 8,000 characters." });

  let convo;
  try {
    convo = req.body?.conversationId ? await getConversation(String(req.body.conversationId), req.visitorId) : null;
  } catch {
    return res.status(400).json({ error: "Invalid conversation id." });
  }
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
    await runCouncilTurn(convo, text, mode, emit, controller.signal, req.visitorId);
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

migrate()
  .catch((error) => console.error("Couldn't create the Council tables:", error.message))
  .finally(() => {
    app.listen(config.port, () => console.log(`Founders Council on http://localhost:${config.port}${authRequired ? " (access code required)" : ""}`));
  });
