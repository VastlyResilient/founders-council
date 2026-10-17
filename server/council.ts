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
  wordsToAvoid,
  type TurnContext,
  formatExcerpt,
} from "./prompt.js";
import {
  getTakes,
  newId,
  saveConversation,
  saveTakes,
  setTitle,
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

const MAX_TOOL_ROUNDS = 4;
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
  // suggested replies sit at the end, possibly separated by blank lines
  while (lines.length && (/^\s*>>\s+/.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) {
    const line = lines.pop()!;
    if (line.trim()) replies.unshift(line.replace(/^\s*>>\s+/, "").trim());
  }
  return { body: lines.join("\n").trimEnd(), replies: replies.slice(0, 3) };
}

/** Pulls "?? question" lines out of a reply; they're asked one at a time in the app. */
export function splitQuestions(text: string) {
  const questions: string[] = [];
  const body = text
    .split("\n")
    .filter((line) => {
      const q = line.match(/^\s*\?\?\s+(.+)$/);
      if (q) questions.push(q[1].trim());
      return !q;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, questions: questions.slice(0, 5) };
}

export async function runCouncilTurn(
  convo: Conversation,
  userText: string,
  mode: Mode,
  emit: (event: CouncilEvent) => void,
  signal: AbortSignal,
  visitorId: string,
  turn: Pick<TurnContext, "replyTo" | "expand"> & { answers?: { q: string; a: string }[] } = {},
) {
  const userMessage: StoredMessage = {
    id: newId(),
    role: "user",
    text: userText,
    mode,
    ...(turn.replyTo ? { replyTo: turn.replyTo } : {}),
    ...(turn.expand ? { expand: true } : {}),
    ...(turn.answers?.length ? { answers: turn.answers } : {}),
    createdAt: new Date().toISOString(),
  };

  const libraryStats = await stats();

  // Founders join once the person has asked their real question, picked for that problem.
  if (!convo.voices?.length) {
    const recent = convo.messages.slice(-4).map((m) => `${m.role === "user" ? "PERSON" : "COUNCIL"}: ${m.text.slice(0, 400)}`).join("\n");
    const picked = await chooseVoices(userText, recent).catch(() => []);
    if (picked.length) {
      convo.voices = picked;
      userMessage.joined = picked;
      emit({ type: "voices", voices: picked });
    }
  }
  emit({ type: "status", text: `Searching ${libraryStats?.episodes ?? "all"} episodes` });

  const lastAssistant = [...convo.messages].reverse().find((m) => m.role === "assistant");
  const retrievalQuery = turn.replyTo
    ? `${userText}\n\nAbout: ${turn.replyTo.slice(0, 500)}`
    : lastAssistant
      ? `${userText}\n\nContext: ${lastAssistant.text.slice(0, 400)}`
      : userText;
  let initialSources: Source[] = [];
  try {
    initialSources = await searchTranscripts(retrievalQuery, 10);
  } catch (error) {
    emit({ type: "status", text: "Transcript search is offline. Answering from the pattern library" });
    console.warn("search failed:", (error as Error).message);
  }
  const allSources: Source[] = [...initialSources];
  emit({ type: "sources", sources: toPublic(allSources) });

  const history: Anthropic.Beta.Messages.BetaMessageParam[] = convo.messages
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.questions?.length ? `${m.text}\n\n${m.questions.map((q) => `?? ${q}`).join("\n")}` : m.text }));
  if (history[0]?.role === "assistant") history.shift();

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...history,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: buildTurnPreamble(mode, initialSources, convo.voices, {
            replyTo: turn.replyTo,
            expand: turn.expand,
            answered: Boolean(turn.answers?.length),
            avoid: wordsToAvoid(convo.messages.filter((m) => m.role === "assistant").slice(-8).map((m) => m.text)),
          }),
        },
        { type: "text", text: userText },
      ],
    },
  ];

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: COUNCIL_SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: buildPersonalContext(await getTakes(visitorId, convo.id).catch(() => []), libraryStats) },
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

  const split = splitReplies(fullText);
  const { body, questions } = splitQuestions(split.body);
  const replies = questions.length ? [] : split.replies;
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
    ...(questions.length ? { questions } : {}),
    sources: (cited.length ? cited : toPublic(allSources)).slice(0, 6),
    createdAt: new Date().toISOString(),
  };

  convo.messages.push(userMessage, assistantMessage);
  await saveConversation(convo, visitorId);
  emit({ type: "done", message: assistantMessage, conversationId: convo.id, title: convo.title, voices: convo.voices });

  if (!convo.titled) void titleSession(convo, visitorId).catch((error) => console.warn("title failed:", error.message));
  void updateMemory(visitorId, convo.id, userText, body).catch((error) => console.warn("memory update failed:", error.message));
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
async function updateMemory(visitorId: string, conversationId: string, userText: string, councilText: string) {
  const takes = await getTakes(visitorId, conversationId);
  const response = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 2000,
    output_config: { format: zodOutputFormat(MemoryUpdate) },
    messages: [
      {
        role: "user",
        content: `You keep short notes on a founder during one advisory session. Record only durable facts about the person: their beliefs and takes (what they think is true about business), goals, ventures they run or plan, recurring tendencies in how they decide, and context like their market or constraints. Skip anything only relevant to this one exchange, and skip what the advisor said unless the person agreed with it.

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
  await saveTakes(visitorId, conversationId, next.slice(-40));
}

type Voice = { id: string; name: string; bestFor: string[] };
const VOICES: Voice[] = JSON.parse(readFileSync(path.resolve(process.cwd(), "server/knowledge/voices.json"), "utf8"));
const VoicePick = z.object({ ready: z.boolean(), ids: z.array(z.string()) });

/**
 * Decides whether the person has asked their real question yet, and if so which two or three
 * founders are closest to that problem. Greetings and small talk return nobody.
 */
async function chooseVoices(message: string, recent: string): Promise<string[]> {
  const response = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 400,
    output_config: { format: zodOutputFormat(VoicePick) },
    messages: [
      {
        role: "user",
        content: `A person is talking to an advisory council of founders. Decide two things.

1. ready: has the person now stated a real question, problem, decision or idea they want help with? Greetings, thanks, "hi", "are you there", or vague openers are not ready.
2. ids: if ready, the 2 or 3 founders closest to this exact problem — people who faced this kind of situation and solved it. Fit beats fame. Otherwise an empty list.

Founders:
${VOICES.map((v) => `${v.id}: ${v.name} — ${v.bestFor.join(", ")}`).join("\n")}

${recent ? `Conversation so far:\n${recent}\n\n` : ""}Latest message: ${message.slice(0, 1500)}`,
      },
    ],
  });
  const out = response.parsed_output;
  if (!out?.ready) return [];
  return out.ids
    .map((id) => VOICES.find((v) => v.id === id)?.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);
}

const SessionTitle = z.object({ title: z.string() });

/** Replaces the first-message title with a short summary of what the session is about. */
export async function titleSession(convo: Pick<Conversation, "id" | "messages">, visitorId: string) {
  const transcript = convo.messages
    .slice(0, 6)
    .map((m) => `${m.role === "user" ? "PERSON" : "COUNCIL"}: ${m.text.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, "$1").slice(0, 600)}`)
    .join("\n");
  const response = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 200,
    output_config: { format: zodOutputFormat(SessionTitle) },
    messages: [
      {
        role: "user",
        content: `Write a title for this advisory session, like a chat title in a messaging app: 3 to 6 words, sentence case, no quotes or ending punctuation, naming the topic and goal (e.g. "Finding the first HVAC customer", "Pricing an automation service"). Summarize; don't copy the first message.

${transcript}`,
      },
    ],
  });
  const title = response.parsed_output?.title?.trim().replace(/[."]+$/, "");
  if (title) await setTitle(convo.id, visitorId, title.slice(0, 70));
}

const Explanation = z.object({
  simple: z.string(),
  examples: z.array(z.string()),
});

/** Restates one of the Council's questions in plain words, with examples from the person's own business. */
export async function explainQuestion(convo: Conversation, question: string) {
  const said = convo.messages
    .filter((m) => m.role === "user")
    .map((m) => m.text)
    .join("\n")
    .slice(-3000);
  const response = await client.messages.parse({
    model: config.memoryModel,
    max_tokens: 700,
    output_config: { format: zodOutputFormat(Explanation) },
    messages: [
      {
        role: "user",
        content: `A founder's advisor asked this person a question they may not fully understand. Help them answer it.

<what_they_told_the_advisor>
${said || "(nothing yet)"}
</what_they_told_the_advisor>

<question>${question}</question>

- simple: the question restated in the simplest everyday words, using their own business and situation by name, plus what kind of answer is useful. One or two short sentences.
- examples: exactly 2 short, concrete example answers someone in their exact business might give (one line each, under 22 words, written in first person). Make them realistic and different from each other.

Plain words, no jargon. Never invent facts about them; examples are clearly hypothetical.`,
      },
    ],
  });
  const out = response.parsed_output;
  if (!out) throw new Error("Couldn't explain that question.");
  return { simple: out.simple.trim(), examples: out.examples.slice(0, 2).map((e) => e.trim()) };
}
