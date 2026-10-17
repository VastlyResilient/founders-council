import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "./env.js";
import { corpusStats, searchTranscripts, type Source } from "./retrieve.js";
import {
  COUNCIL_SYSTEM,
  buildPersonalContext,
  buildTurnPreamble,
  formatExcerpt,
} from "./prompt.js";
import {
  getTakes,
  newId,
  saveConversation,
  saveTakes,
  type Conversation,
  type Mode,
  type StoredMessage,
  type Take,
} from "./store.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  authToken: null,
  baseURL: config.anthropicBaseURL,
});

export type CouncilEvent =
  | { type: "status"; text: string }
  | { type: "sources"; sources: PublicSource[] }
  | { type: "voices"; voices: string[] }
  | { type: "text"; delta: string }
  | { type: "done"; message: StoredMessage; conversationId: string; title: string; voices: string[] }
  | { type: "error"; message: string };

type PublicSource = NonNullable<StoredMessage["sources"]>[number];

const SearchInput = z.object({ query: z.string().min(2).max(400) });

const tools: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: "search_transcripts",
    description:
      "Semantic search over the full transcripts of every Founders and David Senra episode. Returns verbatim passages with show, episode title, and timestamp. Use it to find what a specific founder did, to find evidence for or against the person's take, or to find counterexamples. Phrase queries as the idea you're looking for, e.g. 'Henry Singleton buying back stock when shares were cheap'.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for in the transcripts." } },
      required: ["query"],
    },
  },
];

const MAX_TOOL_ROUNDS = 3;
const HISTORY_LIMIT = 24;

let statsCache: { value: { episodes: number; chunks: number } | null; at: number } | null = null;
async function stats() {
  if (!statsCache || Date.now() - statsCache.at > 10 * 60_000) {
    statsCache = { value: await corpusStats().catch(() => null), at: Date.now() };
  }
  return statsCache.value;
}

function toPublic(sources: Source[]): PublicSource[] {
  const seen = new Set<string>();
  const out: PublicSource[] = [];
  for (const s of sources) {
    if (seen.has(s.episodeId)) continue;
    seen.add(s.episodeId);
    out.push({ episodeId: s.episodeId, title: s.title, show: s.show, url: s.url, startSeconds: s.startSeconds });
  }
  return out;
}

export function splitReplies(text: string) {
  const lines = text.trimEnd().split("\n");
  const replies: string[] = [];
  while (lines.length && /^\s*>>\s+/.test(lines[lines.length - 1])) {
    replies.unshift(lines.pop()!.replace(/^\s*>>\s+/, "").trim());
  }
  return { body: lines.join("\n").trimEnd(), replies: replies.slice(0, 3) };
}

export async function runCouncilTurn(
  convo: Conversation,
  userText: string,
  mode: Mode,
  emit: (event: CouncilEvent) => void,
  signal: AbortSignal,
  visitorId: string,
) {
  const userMessage: StoredMessage = {
    id: newId(),
    role: "user",
    text: userText,
    mode,
    createdAt: new Date().toISOString(),
  };

  const libraryStats = await stats();

  if (!convo.voices?.length) {
    convo.voices = await chooseVoices(userText, await getTakes(visitorId).catch(() => [])).catch(() => []);
  }
  if (convo.voices.length) emit({ type: "voices", voices: convo.voices });
  emit({ type: "status", text: `Searching ${libraryStats?.episodes ?? "all"} episodes` });

  const lastAssistant = [...convo.messages].reverse().find((m) => m.role === "assistant");
  const retrievalQuery = lastAssistant ? `${userText}\n\nContext: ${lastAssistant.text.slice(0, 400)}` : userText;
  let initialSources: Source[] = [];
  try {
    initialSources = await searchTranscripts(retrievalQuery, 8);
  } catch (error) {
    emit({ type: "status", text: "Transcript search is offline. Answering from the pattern library" });
    console.warn("search failed:", (error as Error).message);
  }
  const allSources: Source[] = [...initialSources];
  emit({ type: "sources", sources: toPublic(allSources) });

  const history: Anthropic.Beta.Messages.BetaMessageParam[] = convo.messages
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.text }));
  if (history[0]?.role === "assistant") history.shift();

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...history,
    {
      role: "user",
      content: [
        { type: "text", text: buildTurnPreamble(mode, initialSources, convo.voices) },
        { type: "text", text: userText },
      ],
    },
  ];

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: COUNCIL_SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: buildPersonalContext(await getTakes(visitorId).catch(() => []), libraryStats) },
  ];

  let fullText = "";
  let toolRounds = 0;

  emit({ type: "status", text: "The Council is thinking" });

  while (true) {
    const stream = client.beta.messages.stream(
      {
        model: config.councilModel,
        max_tokens: 32000,
        system,
        tools,
        messages,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );

    let startedText = false;
    stream.on("text", (delta) => {
      if (!startedText && fullText && !fullText.endsWith("\n\n")) {
        fullText += "\n\n";
        emit({ type: "text", delta: "\n\n" });
      }
      startedText = true;
      fullText += delta;
      emit({ type: "text", delta });
    });

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.APIError) throw error;
      if (signal.aborted) throw error;
      // Tool input could not be parsed; retry the round once.
      if (toolRounds++ >= MAX_TOOL_ROUNDS) throw error;
      continue;
    }

    if (message.stop_reason === "refusal") {
      if (!fullText.trim()) {
        fullText = "I can't help with that one. Try asking it a different way.";
        emit({ type: "text", delta: fullText });
      }
      break;
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
    );
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;
    if (message.stop_reason === "tool_use" && toolRounds >= MAX_TOOL_ROUNDS) {
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: "Search limit reached for this turn. Answer with what you have.",
        })),
      });
      toolRounds++;
      if (toolRounds > MAX_TOOL_ROUNDS + 1) break;
      continue;
    }

    toolRounds++;
    messages.push({ role: "assistant", content: message.content });

    const results = await Promise.all(
      toolUses.map(async (tool): Promise<Anthropic.Beta.Messages.BetaToolResultBlockParam> => {
        const parsed = SearchInput.safeParse(tool.input);
        if (!parsed.success) {
          return {
            type: "tool_result",
            tool_use_id: tool.id,
            is_error: true,
            content: JSON.stringify({ INVALID_JSON: JSON.stringify(tool.input) }),
          };
        }
        emit({ type: "status", text: `Looking up “${parsed.data.query.slice(0, 60)}”` });
        try {
          const found = await searchTranscripts(parsed.data.query, 6);
          allSources.push(...found);
          emit({ type: "sources", sources: toPublic(allSources) });
          return {
            type: "tool_result",
            tool_use_id: tool.id,
            content: found.length
              ? found.map((s, i) => formatExcerpt(s, i + 1)).join("\n\n")
              : "No passages matched.",
          };
        } catch (error) {
          return {
            type: "tool_result",
            tool_use_id: tool.id,
            is_error: true,
            content: `Search failed: ${(error as Error).message}`,
          };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }

  const { body, replies } = splitReplies(fullText);
  const cited = toPublic(allSources).filter((s) => {
    const episodeNumber = s.title.match(/#\d+/)?.[0];
    if (episodeNumber && body.includes(episodeNumber)) return true;
    const subject = s.title.replace(/^#\d+\s*/, "").split(/[|:(,]/)[0].trim();
    const key = subject.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    return key.length > 4 && body.toLowerCase().includes(key);
  });

  const assistantMessage: StoredMessage = {
    id: newId(),
    role: "assistant",
    text: body,
    replies,
    sources: (cited.length ? cited : toPublic(allSources)).slice(0, 6),
    createdAt: new Date().toISOString(),
  };

  convo.messages.push(userMessage, assistantMessage);
  await saveConversation(convo, visitorId);
  emit({ type: "done", message: assistantMessage, conversationId: convo.id, title: convo.title, voices: convo.voices });

  void updateMemory(visitorId, userText, body).catch((error) => console.warn("memory update failed:", error.message));
}

const MemoryUpdate = z.object({
  add: z.array(
    z.object({
      kind: z.enum(["belief", "goal", "venture", "tendency", "context"]),
      text: z.string(),
    }),
  ),
  update: z.array(z.object({ id: z.string(), text: z.string() })),
  remove: z.array(z.string()),
});

/** Keeps a short, durable profile of the person's takes, goals, and ventures. */
async function updateMemory(visitorId: string, userText: string, councilText: string) {
  const takes = await getTakes(visitorId);
  const response = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 2000,
    output_config: { format: zodOutputFormat(MemoryUpdate) },
    messages: [
      {
        role: "user",
        content: `You maintain a short profile of a founder who talks to an advisor. Record only durable facts about the person: their beliefs and takes (what they think is true about business), goals, ventures they run or plan, recurring tendencies in how they decide, and context like their market or constraints. Skip anything only relevant to this one exchange, and skip what the advisor said unless the person agreed with it.

Current profile:
${takes.length ? takes.map((t) => `${t.id} [${t.kind}] ${t.text}`).join("\n") : "(empty)"}

Latest exchange:
PERSON: ${userText}
ADVISOR: ${councilText.slice(0, 3000)}

Return additions (one short sentence each, in third person), rewrites of existing items that changed (by id), and ids to remove because they're now contradicted. Return empty lists when nothing durable was said.`,
      },
    ],
  });

  const update = response.parsed_output;
  if (!update) return;
  const now = new Date().toISOString();
  const byId = new Map(takes.map((t) => [t.id, t]));
  for (const id of update.remove) byId.delete(id);
  for (const u of update.update) {
    const existing = byId.get(u.id);
    if (existing) byId.set(u.id, { ...existing, text: u.text, updatedAt: now });
  }
  const next: Take[] = [...byId.values()];
  for (const a of update.add) next.push({ id: newId(), kind: a.kind, text: a.text, createdAt: now, updatedAt: now });
  await saveTakes(visitorId, next.slice(-80));
}

type Voice = { id: string; name: string; bestFor: string[] };
const VOICES: Voice[] = JSON.parse(readFileSync(path.resolve(process.cwd(), "server/knowledge/voices.json"), "utf8"));
const VoicePick = z.object({ ids: z.array(z.string()) });

/** Picks the two or three founders whose voices best fit what this session is about. */
async function chooseVoices(firstMessage: string, takes: Take[]): Promise<string[]> {
  const response = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 400,
    output_config: { format: zodOutputFormat(VoicePick) },
    messages: [
      {
        role: "user",
        content: `Pick the 2 or 3 founders whose voices and experience best fit this conversation. Prefer founders who faced this exact kind of situation; mix temperaments when it helps (e.g. one visionary, one operator). Return their ids.

Founders:
${VOICES.map((v) => `${v.id}: ${v.name} — ${v.bestFor.join(", ")}`).join("\n")}

About the person: ${takes.map((t) => t.text).join(" ") || "nothing yet"}

Their first message: ${firstMessage.slice(0, 1500)}`,
      },
    ],
  });
  const ids = response.parsed_output?.ids ?? [];
  return ids
    .map((id) => VOICES.find((v) => v.id === id)?.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);
}
