import { useCallback, useRef, useState } from "react";
import { api, streamChat, type ChatMessage, type Mode, type Source } from "./api";

export type Streaming = { text: string; status: string; sources: Source[]; userText: string; mode: Mode };

const LAST_KEY = "fc:lastConversation";

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function lastConversationId() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Hides the trailing ">> suggested reply" lines while text is still streaming in. */
export function visibleText(text: string) {
  return text
    .replace(/(^|\n)\s*>{1,2}(\s[^\n]*)?$/g, "")
    .replace(/(\n\s*>>[^\n]*)+\s*$/g, "")
    .replace(/\[\[[^\]]*\]?$/, "") // a founder name still streaming in
    .replace(/\{\{[^}]*\}?$/, ""); // a quote card still streaming in
}

export function useCouncil() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [voices, setVoices] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const live = useRef<{ text: string; sources: Source[] }>({ text: "", sources: [] });

  const send = useCallback(
    async (text: string, mode: Mode, opts: { replyTo?: string; expand?: boolean } = {}) => {
      const message = text.trim();
      if (!message || controller.current) return;
      setError(null);
      const abort = new AbortController();
      controller.current = abort;
      const pendingUser: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: "user",
        text: message,
        mode,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        ...(opts.expand ? { expand: true } : {}),
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, pendingUser]);
      setStreaming({ text: "", status: "Delivered", sources: [], userText: message, mode });
      live.current = { text: "", sources: [] };
      let finished = false;

      try {
        await streamChat(
          { message, mode, conversationId, replyTo: opts.replyTo, expand: opts.expand },
          (event) => {
            if (event.type === "status") setStreaming((s) => (s ? { ...s, status: event.text } : s));
            else if (event.type === "voices") {
              setVoices(event.voices);
              // they join right after the question that brought them in
              setMessages((m) => m.map((msg) => (msg.id === pendingUser.id ? { ...msg, joined: event.voices } : msg)));
            }
            else if (event.type === "sources") {
              live.current.sources = event.sources;
              setStreaming((s) => (s ? { ...s, sources: event.sources } : s));
            } else if (event.type === "text") {
              live.current.text += event.delta;
              setStreaming((s) => (s ? { ...s, text: s.text + event.delta } : s));
            } else if (event.type === "done") {
              finished = true;
              setConversationId(event.conversationId);
              setTitle(event.title);
              if (event.voices?.length) setVoices(event.voices);
              remember(event.conversationId);
              setMessages((m) => [...m, event.message]);
              setStreaming(null);
            } else if (event.type === "error") {
              finished = true;
              setError(event.message);
              setStreaming(null);
            }
          },
          abort.signal,
        );
      } catch (err) {
        if (!abort.signal.aborted) setError("The connection to the Council dropped. Send your message again.");
      } finally {
        const partial = visibleText(live.current.text).trim();
        if (!finished && partial) {
          setMessages((m) => [
            ...m,
            { id: `stopped-${Date.now()}`, role: "assistant", text: partial, sources: live.current.sources, createdAt: new Date().toISOString() },
          ]);
        }
        setStreaming(null);
        controller.current = null;
      }
    },
    [conversationId],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  /** Clears the window. `forget` also drops the "pick up where you left off" link. */
  const reset = useCallback((forget = true) => {
    controller.current?.abort();
    setConversationId(null);
    setTitle("");
    setVoices([]);
    setMessages([]);
    setStreaming(null);
    setError(null);
    if (forget) remember(null);
  }, []);

  const load = useCallback(async (id: string) => {
    controller.current?.abort();
    const convo = await api.conversation(id).catch((error) => {
      if (lastConversationId() === id) remember(null); // the session was deleted
      throw error;
    });
    setConversationId(convo.id);
    setTitle(convo.title);
    setVoices(convo.voices ?? []);
    setMessages(convo.messages);
    setStreaming(null);
    setError(null);
    remember(convo.id);
  }, []);

  return { conversationId, title, voices, messages, streaming, error, send, stop, reset, load, setError };
}
