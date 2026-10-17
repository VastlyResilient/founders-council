import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { ChevronLeft, Info, MessagesSquare, RotateCcw, SquarePen } from "lucide-react";
import type { ChatMessage } from "./api";
import { RichText, splitIntoBubbles } from "./RichText";
import { FounderName } from "./Founder";
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

function CouncilGroup({ text, live }: { text: string; live?: boolean }) {
  const bubbles = splitIntoBubbles(text);
  return (
    <div className="flex items-end gap-2">
      <CouncilAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        {bubbles.map((b, i) => (
          <div key={i} className={`bubble bubble-them ${live ? "" : "bubble-in"}`}>
            <RichText text={b} />
            {i === bubbles.length - 1 && <Tail color="rgba(246,248,250,0.9)" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function JoinNotice({ names }: { names: string[] }) {
  return (
    <p className="bubble-in py-1 text-center text-[11px] text-[#18161B]/45">
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
        <span className="mr-1 flex items-center gap-1 text-[11px] font-medium text-[#18161B]/45">
          <mode.Icon size={11} /> {mode.label}
        </span>
      )}
      <div className="bubble bubble-me bubble-in">
        {message.text}
        <Tail color="#0a7cf0" />
      </div>
      {showDelivered && <span className="mr-1 text-[11px] font-medium text-[#18161B]/40">Delivered</span>}
    </div>
  );
}

function Typing({ status }: { status: string }) {
  return (
    <div className="flex items-end gap-2" role="status" aria-live="polite">
      <CouncilAvatar />
      <div className="flex flex-col items-start gap-1">
        <div className="bubble bubble-them flex items-center gap-[5px] !px-4 !py-3">
          <span className="typing-dot" />
          <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
          <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
          <Tail color="rgba(246,248,250,0.9)" />
        </div>
        {status && status !== "Delivered" && <span className="ml-1 text-[11.5px] text-[#18161B]/45">{status}…</span>}
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
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, error]);

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
  const replies = !streaming && last?.role === "assistant" ? last.replies ?? [] : [];
  const liveText = streaming ? visibleText(streaming.text) : "";

  return (
    <section
      aria-label="Conversation with the Founders Council"
      className="liquid-glass-soft font-imessage flex h-full w-full flex-col overflow-hidden rounded-[28px]"
      data-scroll-region
    >
      <header className="relative z-[3] flex items-center justify-between border-b border-white/50 bg-white/25 px-3 py-2.5 shadow-[inset_0_-1px_0_rgba(24,22,27,0.05)]">
        <button
          onClick={onClose}
          className="flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[15px] text-[#0A84FF] hover:bg-white/60"
          aria-label="Close the conversation"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <CouncilAvatar size={34} />
          <span className="mt-0.5 flex max-w-[52vw] items-center gap-1 truncate text-[12px] font-medium text-[#18161B]">
            Founders Council
          </span>
          <span className="max-w-[52vw] truncate text-[10.5px] text-[#18161B]/45">
            {voices.length ? `With ${joinNames(voices)}` : title || (episodes ? `Knows all ${episodes} episodes` : "Every Founders episode")}
          </span>
        </div>
        <div className="flex items-center">
          <button onClick={onNewChat} className="rounded-full p-2 text-[#0A84FF] hover:bg-white/60" aria-label="New chat">
            <SquarePen size={19} strokeWidth={1.9} />
          </button>
          <button onClick={onOpenHistory} className="rounded-full p-2 text-[#0A84FF] hover:bg-white/60" aria-label="Past conversations">
            <MessagesSquare size={19} strokeWidth={1.9} />
          </button>
          <button onClick={onOpenMemory} className="rounded-full p-2 text-[#0A84FF] hover:bg-white/60" aria-label="What the Council knows about you">
            <Info size={20} strokeWidth={1.9} />
          </button>
        </div>
      </header>

      <div ref={scroller} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-3 sm:px-5" style={{ overscrollBehavior: "contain" }}>
        {messages[0] && (
          <p className="pb-1 text-center text-[11px] font-medium text-[#18161B]/40">{formatClock(messages[0].createdAt)}</p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <Fragment key={m.id}>
              <UserBubble message={m} showDelivered={i === lastUserIndex && !streaming && last?.role === "user"} />
              {m.joined?.length ? <JoinNotice names={m.joined} /> : null}
            </Fragment>
          ) : (
            <CouncilGroup key={m.id} text={m.text} />
          ),
        )}
        {streaming &&
          (liveText.trim() ? <CouncilGroup text={liveText} live /> : <Typing status={streaming.status} />)}
        {streaming && liveText.trim() && streaming.status.startsWith("Looking up") && (
          <p className="pl-10 text-[11.5px] text-[#18161B]/45">{streaming.status}…</p>
        )}
        {error && (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <p className="max-w-sm text-[12.5px] text-[#C4271D]">{error}</p>
            <button onClick={onRetry} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#18161B] shadow-sm">
              <RotateCcw size={13} /> Send again
            </button>
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div className="relative z-[3] flex flex-wrap justify-end gap-1.5 border-t border-white/50 bg-white/20 px-3 py-2 sm:px-5" aria-label="Suggested replies">
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
