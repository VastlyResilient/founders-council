import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, Info, MessagesSquare, Maximize2, Reply, RotateCcw, SquarePen } from "lucide-react";
import type { Answer, ChatMessage } from "./api";
import { QuestionFocus, type QaState } from "./QuestionFocus";
import { QUOTE_CARD, RichText, plainText, splitIntoBubbles } from "./RichText";
import { FounderName, initialsOf } from "./Founder";
import { visibleText, type Streaming } from "./useCouncil";
import { MODES } from "./Composer";

export const LOGO_PATH =
  "M 128 192 L 128 256 L 64.5 256 L 32 223 L 0 192 L 0 128 L 64 128 Z M 256 192 L 256 256 L 192.5 256 L 160 223 L 128 192 L 128 128 L 192 128 Z M 128 64 L 128 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 Z M 256 64 L 256 128 L 192.5 128 L 160 95 L 128 64 L 128 0 L 192 0 Z";

function Tail({ color }: { color: string }) {
  return (
    <svg className="bubble-tail" viewBox="0 0 14 20" aria-hidden>
      <path d="M0 0 C0 11 4 17 14 20 C7 20.5 2.5 19 0 16.5 Z" fill={color} />
    </svg>
  );
}

function CouncilAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#3a3840] to-[#18161B] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 256 256">
        <path d={LOGO_PATH} fill="#fff" />
      </svg>
    </span>
  );
}

function joinNames(names: string[]) {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function formatClock(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

type BubbleActions = { onReply: (text: string) => void; onExpand: (text: string) => void };

function QuoteCard({ name, words }: { name: string; words: string }) {
  const initials = initialsOf(name);
  return (
    <figure className="quote-card bubble-in max-w-[min(78%,30rem)] rounded-[18px] px-3.5 py-2.5">
      <figcaption className="mb-1 flex items-center gap-2 text-[12px] font-medium text-ink/70">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-[#3a3840] to-[#18161B] text-[10px] font-semibold text-white">
          {initials}
        </span>
        <FounderName name={name.trim()}>{name.trim()}</FounderName>
      </figcaption>
      <blockquote className="text-[15px] leading-snug text-ink/85">“{words.trim().replace(/^["“]|["”]$/g, "")}”</blockquote>
    </figure>
  );
}

function CouncilGroup({
  id,
  text,
  live,
  actions,
  limit,
  showAvatar = true,
}: {
  id?: string;
  text: string;
  live?: boolean;
  actions?: BubbleActions;
  limit?: number;
  showAvatar?: boolean;
}) {
  const all = splitIntoBubbles(text);
  const bubbles = limit === undefined ? all : all.slice(0, limit);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const close = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest(`[data-bubble-menu="${id}"]`)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, id]);

  if (!bubbles.length) return null;
  return (
    <div className="flex items-end gap-2">
      {showAvatar ? <CouncilAvatar /> : <span className="w-7 shrink-0" aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        {bubbles.map((b, i) => {
          const quote = b.match(QUOTE_CARD);
          if (quote) return <QuoteCard key={i} name={quote[1]} words={quote[2]} />;
          return (
          <div key={i} className="relative max-w-full" data-bubble-menu={id}>
            {open === i && actions && (
              <div
                role="menu"
                className="liquid-glass bubble-in absolute -top-11 left-2 z-10 flex items-center gap-0.5 rounded-full p-1"
                style={{ background: "rgb(var(--paper) / 0.94)", boxShadow: "0 10px 30px -8px rgba(24,22,27,0.35), inset 0 1px 0 #fff" }}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(null);
                    actions.onReply(plainText(b));
                  }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0A84FF] hover:bg-paper/70"
                >
                  <Reply size={15} strokeWidth={2.2} /> Reply
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(null);
                    actions.onExpand(plainText(b));
                  }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0A84FF] hover:bg-paper/70"
                >
                  <Maximize2 size={14} strokeWidth={2.2} /> Expand
                </button>
              </div>
            )}
            <div
              className={`bubble bubble-them ${live ? "" : "bubble-in"} ${actions ? "cursor-pointer" : ""} ${open === i ? "ring-2 ring-[#0A84FF]/40" : ""}`}
              onClick={(e) => {
                if (!actions || (e.target instanceof Element && e.target.closest("button"))) return;
                setOpen((o) => (o === i ? null : i));
              }}
              role={actions ? "button" : undefined}
              tabIndex={actions ? 0 : undefined}
              aria-label={actions ? "Reply to or expand this message" : undefined}
              onKeyDown={(e) => {
                if (actions && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                  e.preventDefault();
                  setOpen((o) => (o === i ? null : i));
                }
              }}
            >
              <RichText text={b} />
              {i === bubbles.length - 1 && showAvatar && <Tail color="var(--bubble-them-tail)" />}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function JoinNotice({ names }: { names: string[] }) {
  return (
    <p className="bubble-in py-1 text-center text-[11px] text-ink/45">
      {names.map((v, i) => (
        <span key={v}>
          <FounderName name={v}>{v}</FounderName>
          {i < names.length - 2 ? ", " : i === names.length - 2 ? " and " : ""}
        </span>
      ))}{" "}
      joined the conversation
    </p>
  );
}

function UserBubble({ message, showDelivered }: { message: ChatMessage; showDelivered: boolean }) {
  const mode = MODES.find((m) => m.id === message.mode);
  return (
    <div className="flex flex-col items-end gap-1">
      {mode && mode.id !== "counsel" && (
        <span className="mr-1 flex items-center gap-1 text-[11px] font-medium text-ink/45">
          <mode.Icon size={11} /> {mode.label}
        </span>
      )}
      {message.replyTo && (
        <div className="mr-3 flex max-w-[78%] items-start gap-1.5 text-right">
          <span className="line-clamp-2 rounded-2xl border border-ink/10 bg-paper/50 px-3 py-1.5 text-left text-[12.5px] leading-snug text-ink/55">
            {message.expand ? "Expand: " : ""}
            {message.replyTo}
          </span>
        </div>
      )}
      {message.answers?.length ? (
        <AnswerBubbles answers={message.answers} />
      ) : (
        <div className="bubble bubble-me bubble-in">
          {message.text}
          <Tail color="#0a7cf0" />
        </div>
      )}
      {showDelivered && <span className="mr-1 text-[11px] font-medium text-ink/40">Delivered</span>}
    </div>
  );
}

function AnswerBubbles({ answers }: { answers: Answer[] }) {
  return (
    <div className="flex w-full flex-col items-end gap-2">
      {answers.map((x, i) => (
        <div key={i} className="flex w-full flex-col items-end gap-1">
          <span className="mr-3 line-clamp-2 max-w-[78%] rounded-2xl border border-ink/10 bg-paper/50 px-3 py-1.5 text-left text-[12.5px] leading-snug text-ink/55">
            {x.q}
          </span>
          <div className="bubble bubble-me bubble-in">
            {x.a}
            {i === answers.length - 1 && <Tail color="#0a7cf0" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function Typing() {
  // iMessage-style: one bubble, three dots, nothing else
  return (
    <div className="flex items-end gap-2" role="status" aria-live="polite">
      <CouncilAvatar />
      <div className="bubble bubble-them flex min-w-[62px] shrink-0 items-center justify-center gap-[5px] !px-4 !py-3">
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
        <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
        <span className="sr-only">The Council is typing</span>
        <Tail color="var(--bubble-them-tail)" />
      </div>
    </div>
  );
}

type Props = {
  title: string;
  voices: string[];
  messages: ChatMessage[];
  streaming: Streaming | null;
  error: string | null;
  episodes: number | null;
  onClose: () => void;
  onRetry: () => void;
  onOpenMemory: () => void;
  onOpenHistory: () => void;
  onReply: (text: string) => void;
  onNewChat: () => void;
  onReplyTo: (text: string) => void;
  onExpand: (text: string) => void;
  conversationId: string | null;
  /** The question flow in progress, if any. */
  qa: QaState | null;
  /** Called when a reply with questions has finished arriving. */
  onQuestions: (messageId: string, questions: string[]) => void;
  onSkipQuestion: () => void;
  /** Questions get the one-at-a-time spotlight only in "Ask me first". */
  askMode: boolean;
};

export function ChatWindow({
  title,
  voices,
  messages,
  streaming,
  error,
  episodes,
  onClose,
  onRetry,
  onOpenMemory,
  onOpenHistory,
  onReply,
  onNewChat,
  onReplyTo,
  onExpand,
  conversationId,
  qa,
  onQuestions,
  onSkipQuestion,
  askMode,
}: Props) {
  // A reply's questions read as ordinary messages, except while they're being asked one at a time.
  const fullText = (m: ChatMessage, hideQuestions: boolean) =>
    m.questions?.length && !hideQuestions ? `${m.text}\n\n${m.questions.join("\n\n")}` : m.text;
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);



  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const last = messages[messages.length - 1];
  const liveText = streaming ? visibleText(streaming.text) : "";

  // Messages arrive one at a time, like someone texting, with typing dots in between.
  const [paced, setPaced] = useState({ active: false, shown: 0 });
  const streamingNow = Boolean(streaming);
  useEffect(() => {
    if (streamingNow) setPaced({ active: true, shown: 0 });
  }, [streamingNow]);
  const turnBubbles = streaming
    ? splitIntoBubbles(liveText).slice(0, -1) // the last paragraph may still be arriving
    : paced.active && last?.role === "assistant"
      ? splitIntoBubbles(fullText(last, askMode))
      : [];
  useEffect(() => {
    if (!paced.active) return;
    if (paced.shown < turnBubbles.length) {
      const next = turnBubbles[paced.shown];
      const delay = paced.shown === 0 ? 350 : Math.min(500 + next.length * 9, 1500);
      const t = window.setTimeout(() => setPaced((p) => ({ ...p, shown: p.shown + 1 })), delay);
      return () => clearTimeout(t);
    }
    if (!streaming && paced.shown >= turnBubbles.length) setPaced({ active: false, shown: 0 });
  }, [paced, turnBubbles.length, streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const pacingLast = paced.active && !streaming && last?.role === "assistant";

  // Once the Council has finished texting, its questions come up one at a time.
  const settled = !streaming && !paced.active;
  useEffect(() => {
    if (askMode && settled && last?.role === "assistant" && last.questions?.length) onQuestions(last.id, last.questions);
  }, [settled, last?.id, askMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, error, paced.shown, qa?.index]);
  const replies = !streaming && !paced.active && last?.role === "assistant" ? last.replies ?? [] : [];

  return (
    <section
      aria-label="Conversation with the Founders Council"
      className="liquid-glass-soft font-imessage relative flex h-full w-full flex-col overflow-hidden rounded-[28px]"
      data-scroll-region
    >
      <header className="relative z-[3] flex items-center justify-between border-b border-white/50 bg-paper/25 px-3 py-2.5 shadow-[inset_0_-1px_0_rgba(24,22,27,0.05)]">
        <button
          onClick={onClose}
          className="flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[15px] text-[#0A84FF] hover:bg-paper/60"
          aria-label="Close the conversation"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <CouncilAvatar size={34} />
          <span className="mt-0.5 flex max-w-[52vw] items-center gap-1 truncate text-[12px] font-medium text-ink">
            Founders Council
          </span>
          <span className="max-w-[52vw] truncate text-[10.5px] text-ink/45">
            {voices.length ? `With ${joinNames(voices)}` : title || (episodes ? `Knows all ${episodes} episodes` : "Every Founders episode")}
          </span>
        </div>
        <div className="flex items-center">
          <button onClick={onNewChat} className="rounded-full p-2 text-[#0A84FF] hover:bg-paper/60" aria-label="New chat">
            <SquarePen size={19} strokeWidth={1.9} />
          </button>
          <button onClick={onOpenHistory} className="rounded-full p-2 text-[#0A84FF] hover:bg-paper/60" aria-label="Past conversations">
            <MessagesSquare size={19} strokeWidth={1.9} />
          </button>
          <button onClick={onOpenMemory} className="rounded-full p-2 text-[#0A84FF] hover:bg-paper/60" aria-label="What the Council knows about you">
            <Info size={20} strokeWidth={1.9} />
          </button>
        </div>
      </header>

      <div ref={scroller} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-3 sm:px-5" style={{ overscrollBehavior: "contain" }}>
        {messages[0] && (
          <p className="pb-1 text-center text-[11px] font-medium text-ink/40">{formatClock(messages[0].createdAt)}</p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <Fragment key={m.id}>
              <UserBubble message={m} showDelivered={i === lastUserIndex && !streaming && last?.role === "user"} />
              {m.joined?.length ? <JoinNotice names={m.joined} /> : null}
            </Fragment>
          ) : i === messages.length - 1 && pacingLast ? (
            <CouncilGroup key={m.id} id={m.id} text={fullText(m, askMode)} limit={paced.shown} showAvatar={false} />
          ) : (
            <CouncilGroup
              key={m.id}
              id={m.id}
              text={fullText(m, qa?.messageId === m.id)}
              actions={streaming || paced.active ? undefined : { onReply: onReplyTo, onExpand }} />
          ),
        )}
        {qa && qa.answers.length > 0 && (
          <div className="flex flex-col items-end">
            <AnswerBubbles answers={qa.answers} />
          </div>
        )}
        {streaming && <CouncilGroup text={liveText} live limit={paced.shown} showAvatar={false} />}
        {(streaming || pacingLast) && <Typing />}
        {error && (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <p className="max-w-sm text-[12.5px] text-[#C4271D]">{error}</p>
            <button onClick={onRetry} className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-sm">
              <RotateCcw size={13} /> Send again
            </button>
          </div>
        )}
      </div>

      {qa && settled && <QuestionFocus qa={qa} conversationId={conversationId} onSkip={onSkipQuestion} />}

      {replies.length > 0 && !qa && (
        <div className="relative z-[3] flex flex-wrap justify-end gap-1.5 border-t border-white/50 bg-paper/20 px-3 py-2 sm:px-5" aria-label="Suggested replies">
          {replies.map((r) => (
            <button
              key={r}
              onClick={() => onReply(r)}
              className="liquid-glass rounded-full px-3 py-1.5 text-[13px] text-[#0A84FF] transition-colors hover:text-[#0060d0]"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
