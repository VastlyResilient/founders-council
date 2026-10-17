import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Room the mode menu needs below the bar before it opens downward. */
const MENU_SPACE = 230;
import { createPortal } from "react-dom";
import { ArrowUp, Flame, HelpCircle, ListChecks, Mic, MicOff, Scale, Square, Check, Reply, X } from "lucide-react";
import type { Mode } from "./api";

export const MODES: { id: Mode; label: string; hint: string; Icon: typeof Scale }[] = [
  { id: "counsel", label: "Counsel", hint: "An honest read and your next move", Icon: Scale },
  { id: "grill", label: "Grill me", hint: "Stress-test your idea", Icon: Flame },
  { id: "ask", label: "Ask me first", hint: "Questions before any advice", Icon: HelpCircle },
  { id: "act", label: "Action plan", hint: "Next 48 hours and a daily rep", Icon: ListChecks },
];

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  placeholder?: string;
  replyingTo?: string | null;
  onCancelReply?: () => void;
  /** Called with the open menu's height (0 when closed). */
  onMenuSpace?: (px: number) => void;
};

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { value, onChange, onSend, onStop, busy, mode, onModeChange, placeholder, replyingTo, onCancelReply, onMenuSpace },
  ref,
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const modeButton = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Tell the page how much room the open menu takes, so what sits under the bar can move out of its way.
  useLayoutEffect(() => {
    onMenuSpace?.(menuOpen && menuRef.current ? menuRef.current.getBoundingClientRect().height + 8 : 0);
  }, [menuOpen, onMenuSpace]);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const baseText = useRef("");
  const current = MODES.find((m) => m.id === mode)!;
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "0px";
      el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 140)}px`;
    };
    fit();
    // Re-measure when the bar changes width (it starts card-sized and grows into a pill).
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const toggleDictation = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    baseText.current = value ? `${value.trimEnd()} ` : "";
    rec.onresult = (e) => {
      let spoken = "";
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript;
      onChange(baseText.current + spoken);
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  };

  const canSend = value.trim().length > 0 && !busy;

  return (
    <div className="relative w-full">
      {replyingTo && (
        <div className="flex items-start gap-2 border-b border-white/50 px-4 pb-2 pt-2.5">
          <Reply size={14} className="mt-0.5 shrink-0 text-[#0A84FF]" />
          <span className="line-clamp-2 flex-1 text-[12.5px] leading-snug text-ink/60">
            <span className="font-medium text-[#0A84FF]">Replying to </span>
            {replyingTo}
          </span>
          <button onClick={onCancelReply} aria-label="Cancel reply" className="rounded-full p-0.5 text-ink/45 hover:text-ink">
            <X size={15} />
          </button>
        </div>
      )}
    <div className="relative flex w-full items-end gap-1.5 px-2 py-[9px]">
      <div className="relative">
        <button
          ref={modeButton}
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Mode: ${current.label}. Change mode`}
          className="flex h-10 items-center gap-1.5 rounded-full bg-paper/55 pl-2.5 pr-3 text-[13px] font-medium text-ink/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-colors hover:bg-paper/80"
        >
          <current.Icon size={16} strokeWidth={1.9} />
          <span className="hidden sm:inline">{current.label}</span>
        </button>
        {menuOpen &&
          modeButton.current &&
          createPortal(
            // Rendered at the top of the page so headings and panels can never cover it.
            <>
              <button aria-hidden tabIndex={-1} className="fixed inset-0 z-[90] cursor-default" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                ref={menuRef}
                data-scroll-region
                className="liquid-glass-soft fixed z-[91] rounded-[22px] p-1.5"
                style={(() => {
                  const bar = (modeButton.current.closest(".card-morph") ?? modeButton.current).getBoundingClientRect();
                  // Opens below the bar when there's room (the landing page); above it in the chat, where the bar sits at the bottom.
                  const below = window.innerHeight - bar.bottom > MENU_SPACE;
                  return {
                    left: bar.left,
                    width: bar.width,
                    ...(below ? { top: bar.bottom + 8 } : { bottom: window.innerHeight - bar.top + 8 }),
                    background: "rgb(var(--paper) / 0.94)",
                  };
                })()}
              >
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    role="menuitemradio"
                    aria-checked={m.id === mode}
                    onClick={() => {
                      onModeChange(m.id);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.05] ${
                      m.id === mode ? "bg-ink/[0.05]" : ""
                    }`}
                  >
                    <m.Icon size={17} strokeWidth={1.8} className="shrink-0 text-ink/70" />
                    <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
                      <span className="shrink-0 text-[14.5px] font-medium text-ink">{m.label}</span>
                      <span className="truncate text-[13.5px] text-ink/50">{m.hint}</span>
                    </span>
                    {m.id === mode && <Check size={15} className="shrink-0 text-[#0A84FF]" />}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )}
      </div>

      <label className="sr-only" htmlFor="council-input">
        Message the Founders Council
      </label>
      <textarea
        id="council-input"
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={placeholder ?? (typeof window !== "undefined" && window.innerWidth < 480 ? "Ask or share a take" : "Ask the Council, or share a take")}
        className="font-imessage max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-[9px] text-[16px] leading-[22px] text-ink placeholder:text-ink/45 focus:outline-none"
      />

      {speechSupported && (
        <button
          type="button"
          onClick={toggleDictation}
          aria-label={listening ? "Stop dictation" : "Dictate"}
          aria-pressed={listening}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            listening ? "bg-[#FF3B30] text-white" : "text-ink/60 hover:bg-paper/60 hover:text-ink"
          }`}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} strokeWidth={1.9} />}
        </button>
      )}

      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop the answer"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-transform active:scale-95"
        >
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A84FF] text-white shadow-[0_4px_14px_-4px_rgba(10,132,255,0.7)] transition-all active:scale-95 disabled:bg-ink/15 disabled:shadow-none"
        >
          <ArrowUp size={20} strokeWidth={2.4} />
        </button>
      )}
    </div>
    </div>
  );
});
