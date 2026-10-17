export type Mode = "counsel" | "grill" | "ask" | "act";

export type Source = {
  episodeId: string;
  title: string;
  show: string;
  url: string | null;
  startSeconds: number | null;
};

export type Answer = { q: string; a: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode?: Mode;
  sources?: Source[];
  replies?: string[];
  questions?: string[];
  answers?: Answer[];
  joined?: string[];
  replyTo?: string;
  expand?: boolean;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  voices?: string[];
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ConversationSummary = { id: string; title: string; voices?: string[]; updatedAt: string; preview: string; count: number };

export type Take = { id: string; kind: string; text: string; updatedAt: string };

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "voices"; voices: string[] }
  | { type: "text"; delta: string }
  | { type: "done"; message: ChatMessage; conversationId: string; title: string; voices?: string[] }
  | { type: "error"; message: string };

export const AUTH_EVENT = "fc:auth-required";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_EVENT));
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const api = {
  session: () => json<{ authRequired: boolean; authenticated: boolean; user: string | null }>("/api/session"),
  logout: () => json("/api/logout", { method: "POST" }),
  health: () => json<{ ok: boolean; library: { episodes: number; chunks: number } | null }>("/api/health"),
  conversations: () => json<ConversationSummary[]>("/api/conversations"),
  conversation: (id: string) => json<Conversation>(`/api/conversations/${id}`),
  deleteConversation: (id: string) => json(`/api/conversations/${id}`, { method: "DELETE" }),
  memory: (conversationId: string) => json<Take[]>(`/api/memory?conversation=${encodeURIComponent(conversationId)}`),
  forget: (id: string) => json(`/api/memory/${id}`, { method: "DELETE" }),
  explain: (conversationId: string, question: string) =>
    json<{ simple: string; examples: string[] }>("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, question }),
    }),
};

export async function streamChat(
  body: { message: string; mode: Mode; conversationId?: string | null; replyTo?: string; expand?: boolean; answers?: Answer[] },
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_EVENT));
  if (!res.ok || !res.body) {
    const error = (await res.json().catch(() => null))?.error ?? "The Council couldn't be reached. Check that the server is running.";
    onEvent({ type: "error", message: error });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}
