import { useEffect, useState, type ReactNode } from "react";
import { Brain, MessagesSquare, BookOpen, Trash2, X } from "lucide-react";
import { api, type ConversationSummary, type Take } from "./api";
import { RichText, plainText } from "./RichText";

export type DrawerKind = "history" | "memory" | "patterns";

function Shell({
  title,
  Icon,
  onClose,
  children,
  dark = false,
}: {
  title: string;
  Icon: typeof Brain;
  onClose: () => void;
  children: ReactNode;
  dark?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70]" data-scroll-region>
      <button aria-label="Close panel" className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${dark ? "liquid-glass-dark" : "liquid-glass-soft"} anim-stagger absolute bottom-3 right-3 top-3 flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px]`}
        style={{ animationDuration: "0.5s" }}
      >
        <header className={`relative z-[3] flex items-center justify-between border-b px-5 py-4 ${dark ? "border-white/10" : "border-black/[0.06]"}`}>
          <h2 className={`flex items-center gap-2 text-[16px] font-medium ${dark ? "glow-title" : "text-ink"}`}>
            <Icon size={18} strokeWidth={1.8} /> {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`rounded-full p-1.5 ${dark ? "text-white/60 hover:bg-paper/10 hover:text-white" : "text-ink/60 hover:bg-paper/70 hover:text-ink"}`}
          >
            <X size={18} />
          </button>
        </header>
        <div className={`thin-scroll relative z-[3] flex-1 overflow-y-auto px-5 py-4 ${dark ? "dark-scroll" : ""}`} style={{ overscrollBehavior: "contain" }}>
          {children}
        </div>
      </aside>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  belief: "Take",
  goal: "Goal",
  venture: "Venture",
  tendency: "Tendency",
  context: "Context",
};

export function Drawer({
  kind,
  onClose,
  onOpenConversation,
  activeId,
  onSwitch,
}: {
  onSwitch: (k: DrawerKind) => void;
  kind: DrawerKind;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
  activeId: string | null;
}) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [patterns, setPatterns] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const fail = () => setFailed(true);
    if (kind === "memory") {
      if (activeId) api.memory(activeId).then(setTakes, fail);
      else setTakes([]);
    }
    if (kind === "history") api.conversations().then(setHistory, fail);
    if (kind === "patterns") fetch("/api/patterns").then((r) => r.text()).then(setPatterns, fail);
  }, [kind, activeId]);

  const offline = failed && <p className="text-[13.5px] text-[#C4271D]">The Council's server isn't responding. Start it with npm run dev, then reopen this panel.</p>;

  if (kind === "memory")
    return (
      <Shell title="What the Council knows in this session" Icon={Brain} onClose={onClose}>
        {offline}
        <p className="mb-3 text-[13.5px] leading-relaxed text-ink/60">
          Within a session, the Council keeps notes on your takes, goals and ventures, and checks new ideas against them. A new chat starts fresh; open a past session to pick its notes back up.
        </p>
        <button
          onClick={() => onSwitch("history")}
          className="mb-4 flex w-full items-center justify-between rounded-2xl bg-[#0A84FF]/10 px-4 py-3 text-left text-[14px] font-medium text-[#0A84FF]"
        >
          <span className="flex items-center gap-2">
            <MessagesSquare size={16} /> Past sessions
          </span>
          <span aria-hidden>›</span>
        </button>
        {takes && takes.length === 0 && (
          <p className="rounded-2xl bg-paper/60 p-4 text-[13.5px] text-ink/65">{activeId ? "Nothing noted in this session yet." : "No session open. Start a chat or open one from Past sessions."}</p>
        )}
        <ul className="space-y-2">
          {takes?.map((t) => (
            <li key={t.id} className="group flex items-start gap-3 rounded-2xl bg-paper/65 px-3.5 py-3">
              <span className="mt-0.5 shrink-0 rounded-full bg-ink/[0.07] px-2 py-0.5 text-[11px] font-medium text-ink/60">
                {KIND_LABEL[t.kind] ?? t.kind}
              </span>
              <span className="flex-1 text-[14px] leading-snug text-ink">{t.text}</span>
              <button
                onClick={() => api.forget(t.id).then(() => setTakes((all) => all?.filter((x) => x.id !== t.id) ?? null))}
                aria-label={`Forget: ${t.text}`}
                className="rounded-full p-1 text-ink/35 opacity-100 transition-opacity hover:text-[#C4271D] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </Shell>
    );

  if (kind === "history")
    return (
      <Shell title="Past sessions" Icon={MessagesSquare} onClose={onClose} dark>
        {offline}
        {history && history.length === 0 && <p className="text-[13.5px] text-white/60">No sessions yet. Your conversations will show up here.</p>}
        <ul className="space-y-2">
          {history?.map((c) => (
            <li key={c.id} className="group relative">
              <button
                onClick={() => {
                  onOpenConversation(c.id);
                  onClose();
                }}
                className={`session-glass w-full rounded-2xl px-3.5 py-3 text-left ${c.id === activeId ? "active" : ""}`}
              >
                <span className="glow-title block truncate pr-7 text-[14.5px] font-medium">{c.title}</span>
                <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-white/65">{plainText(c.preview)}</span>
                <span className="mt-1.5 block text-[11px] text-white/40">
                  {new Date(c.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </button>
              <button
                onClick={() => api.deleteConversation(c.id).then(() => setHistory((h) => h?.filter((x) => x.id !== c.id) ?? null))}
                aria-label={`Delete session: ${c.title}`}
                className="absolute right-2.5 top-2.5 rounded-full p-1 text-white/40 hover:text-[#FF6B60] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </Shell>
    );

  return (
    <Shell title="The patterns" Icon={BookOpen} onClose={onClose}>
      {offline}
      {patterns && (
        <div className="space-y-3 text-[14px] leading-relaxed text-ink/85">
          {patterns
            .replace(/^# .*\n/, "")
            .split(/\n\s*\n/)
            .map((block, i) =>
              block.startsWith("## ") ? (
                <h3 key={i} className="pt-2 text-[15px] font-medium text-ink">
                  {block.replace(/^##\s*/, "")}
                </h3>
              ) : (
                <div key={i} className="whitespace-pre-wrap">
                  <RichText text={block} />
                </div>
              ),
            )}
        </div>
      )}
    </Shell>
  );
}
