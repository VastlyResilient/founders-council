import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Play, Menu, X, User, Plus, MessagesSquare, Flame, HelpCircle, ListChecks, History } from "lucide-react";
import { Composer } from "./council/Composer";
import { ChatWindow, LOGO_PATH } from "./council/ChatWindow";
import { Drawer, type DrawerKind } from "./council/Drawer";
import { lastConversationId, useCouncil } from "./council/useCouncil";
import { api, type Mode } from "./council/api";

const higgs = (raw: string) =>
  `https://images.higgs.ai/?default=1&output=webp&url=${encodeURIComponent(raw)}&w=1920&q=85`;

const BG_IMAGE_1 = higgs(
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260721_161708_64fad17a-06cc-4227-b6d2-1fefec159ec7.png",
);
const BG_IMAGE_2 = higgs(
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260721_161933_6afd5ffe-5710-4fe1-9d61-11843a494893.png",
);
const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260722_103029_2c529df7-48ee-452e-925a-3301b74de32b.mp4";

const SPOTLIGHT_R = 260;
const GRID_CELL = 48;
const EASE = "cubic-bezier(0.16,1,0.3,1)";

type VideoPhase = "idle" | "playing" | "done";

const SPOTLIGHT_MASK = `radial-gradient(circle ${SPOTLIGHT_R}px at var(--sx, -999px) var(--sy, -999px), rgba(255,255,255,1) 0%, rgba(255,255,255,1) 40%, rgba(255,255,255,0.75) 60%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0.12) 88%, rgba(255,255,255,0) 100%)`;

/** Smoothed cursor (rAF, factor 0.1) written into CSS vars that drive the spotlight mask. */
function useSpotlight(target: RefObject<HTMLElement>, active: boolean, onFrame?: (cx: number, cy: number) => void) {
  useEffect(() => {
    const el = target.current;
    if (!el || !active) return;
    let raf = 0;
    const mouse = { x: -999, y: -999 };
    const smooth = { x: -999, y: -999 };
    let seen = false;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      if (!seen) {
        smooth.x = mouse.x;
        smooth.y = mouse.y;
        seen = true;
      }
    };
    const tick = () => {
      smooth.x += (mouse.x - smooth.x) * 0.1;
      smooth.y += (mouse.y - smooth.y) * 0.1;
      el.style.setProperty("--sx", `${smooth.x}px`);
      el.style.setProperty("--sy", `${smooth.y}px`);
      if (onFrame && seen) {
        const rect = el.getBoundingClientRect();
        onFrame(mouse.x / rect.width - 0.5, mouse.y / rect.height - 0.5);
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [target, active, onFrame]);
}

function RevealLayer({ style, className = "" }: { style: CSSProperties; className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ ...style, maskImage: SPOTLIGHT_MASK, WebkitMaskImage: SPOTLIGHT_MASK }}
    />
  );
}

function Logo({ dark }: { dark: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 256 256" aria-hidden>
      <path d={LOGO_PATH} fill={dark ? "#18161B" : "#fff"} className="transition-colors duration-500" />
    </svg>
  );
}

/* ---------------------------------- Nav ---------------------------------- */

type NavItem = { label: string; onClick: () => void; active?: boolean };

function Nav({ dark, items, onAccount, onStart, startLabel }: { dark: boolean; items: NavItem[]; onAccount: () => void; onStart: () => void; startLabel: string }) {
  const [open, setOpen] = useState(false);
  const fg = dark ? "text-[#18161B]" : "text-white";
  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 md:px-10">
        <a href="/" className="flex items-center gap-2.5" aria-label="Founders Council home">
          <Logo dark={dark} />
          <span className={`text-sm font-medium uppercase tracking-wide transition-colors duration-500 ${fg}`}>Founders Council</span>
        </a>

        <div
          className={`absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5 py-1.5 backdrop-blur-md transition-colors duration-500 md:flex ${
            dark ? "bg-[#18161B]/10" : "bg-white/10"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors duration-500 ${
                item.active
                  ? dark
                    ? "bg-[#18161B] text-white"
                    : "bg-white text-[#18161B]"
                  : dark
                    ? "text-[#18161B]/70 hover:text-[#18161B]"
                    : "text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={onAccount}
            className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm backdrop-blur-md transition-colors duration-500 ${
              dark ? "bg-[#18161B]/10 text-[#18161B]" : "bg-white/10 text-white"
            }`}
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-500 ${dark ? "bg-[#18161B]/10" : "bg-white/15"}`}>
              <User size={14} strokeWidth={1.8} />
            </span>
            You
          </button>
          <button
            onClick={onStart}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-500 ${
              dark ? "bg-[#18161B] text-white" : "bg-white text-[#18161B]"
            }`}
          >
            {startLabel}
          </button>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className={`relative h-9 w-9 md:hidden ${fg}`}
        >
          <Menu size={22} className={`absolute inset-0 m-auto transition-all duration-300 ${open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"}`} />
          <X size={22} className={`absolute inset-0 m-auto transition-all duration-300 ${open ? "rotate-0 opacity-100 text-white" : "-rotate-90 opacity-0"}`} />
        </button>
      </nav>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[54] bg-black/60 backdrop-blur-sm transition-opacity duration-500 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        className={`fixed inset-x-0 top-0 z-[55] bg-[#0A0B11]/[0.98] px-5 pb-8 pt-20 transition-transform duration-500 md:hidden ${open ? "translate-y-0" : "-translate-y-full"}`}
        style={{ transitionTimingFunction: EASE }}
      >
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li
              key={item.label}
              className={`transition-all duration-500 ${open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
              style={{ transitionDelay: open ? `${80 + i * 40}ms` : "0ms", transitionTimingFunction: EASE }}
            >
              <button
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="w-full py-2.5 text-left text-2xl font-light text-white"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div
          className={`mt-6 flex gap-2 transition-all duration-500 ${open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
          style={{ transitionDelay: open ? "300ms" : "0ms", transitionTimingFunction: EASE }}
        >
          <button
            onClick={() => {
              setOpen(false);
              onAccount();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-sm text-white"
          >
            <User size={14} /> You
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onStart();
            }}
            className="flex-1 rounded-full bg-white py-3 text-sm font-medium text-[#18161B]"
          >
            {startLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- Hero --------------------------------- */

function HeroSection({ hidden, episodes, onStart }: { hidden: boolean; episodes: number | null; onStart: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const patternRef = useRef<SVGPatternElement>(null);
  const grid = useRef({ x: 0, y: 0 });
  const onFrame = useCallback((cx: number, cy: number) => {
    grid.current.x += (cx * 16 - grid.current.x) * 0.06;
    grid.current.y += (cy * 16 - grid.current.y) * 0.06;
    patternRef.current?.setAttribute("x", String(grid.current.x));
    patternRef.current?.setAttribute("y", String(grid.current.y));
  }, []);
  useSpotlight(ref, !hidden, onFrame);

  return (
    <section
      ref={ref}
      aria-hidden={hidden}
      className={`font-helvetica-neue absolute inset-0 z-[3] h-screen overflow-clip bg-[#0A0B11] transition-opacity duration-700 ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ opacity: 0.08 }} aria-hidden>
        <defs>
          <pattern ref={patternRef} id="hero-grid" width={GRID_CELL} height={GRID_CELL} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID_CELL} 0 L 0 0 0 ${GRID_CELL}`} fill="none" stroke="#94a3b8" strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
      <div className="anim-fade absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BG_IMAGE_1})`, animationDelay: "0.1s" }} />
      <RevealLayer className="bg-cover bg-center" style={{ backgroundImage: `url(${BG_IMAGE_2})` }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-72 bg-gradient-to-t from-[#0A0B11] via-[#0A0B11]/60 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-50 grid gap-8 px-6 pb-12 sm:px-10 sm:pb-16 md:grid-cols-12 md:px-14 md:pb-20">
        <div className="md:col-span-8 lg:col-span-7">
          <div className="anim-stagger flex items-center gap-2.5" style={{ animationDelay: "0.3s" }}>
            <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
            <span className="text-sm text-white/80 sm:text-[15px]">
              Built from {episodes ? `all ${episodes}` : "every"} Founders and David Senra episodes
            </span>
          </div>
          <h1
            className="anim-stagger mt-5 font-light text-white"
            style={{ fontSize: "clamp(2.2rem, 6.5vw, 5rem)", lineHeight: 0.95, letterSpacing: "-0.03em", animationDelay: "0.5s" }}
          >
            Learn From the Greats
            <br />
            Without Starting Over
          </h1>
          <div className="anim-stagger mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.7s" }}>
            <button onClick={onStart} className="rounded-full bg-white px-6 py-3 text-[15px] text-gray-900 transition-transform active:scale-[0.98]">
              Ask the Council
            </button>
            <button
              onClick={onStart}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-[15px] text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              <Play size={13} fill="currentColor" /> Watch Intro
            </button>
          </div>
        </div>
        <div className="anim-stagger self-end md:col-span-4 md:col-start-9 lg:col-span-5 lg:col-start-8 lg:pl-16" style={{ animationDelay: "0.85s" }}>
          <p className="max-w-md text-[15px] leading-relaxed text-white/75 sm:text-base md:ml-auto">
            The Founders Council is an advisor built from the full transcripts of every episode. Bring it an idea or a take. It asks questions, pushes back, and ties every answer to what the great founders actually did.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Council scene ----------------------------- */

const STARTERS: { label: string; text: string; mode: Mode; Icon: typeof Flame }[] = [
  { label: "Grill my idea", text: "Grill my idea: ", mode: "grill", Icon: Flame },
  { label: "I have a take", text: "Here's my take, tell me if the record agrees: ", mode: "counsel", Icon: MessagesSquare },
  { label: "Ask me questions first", text: "I'm deciding whether to ", mode: "ask", Icon: HelpCircle },
  { label: "Build me a 48-hour plan", text: "Turn this into a plan: ", mode: "act", Icon: ListChecks },
];

type Stagger = (delay: number) => { className: string; style: CSSProperties };

function CouncilSection({
  visible,
  revealed,
  episodes,
  openDrawer,
  composerFocus,
  council,
}: {
  council: ReturnType<typeof useCouncil>;
  visible: boolean;
  revealed: boolean;
  episodes: number | null;
  openDrawer: (k: DrawerKind) => void;
  composerFocus: RefObject<HTMLTextAreaElement>;
}) {
  const ref = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("counsel");
  const [shape, setShape] = useState<"card" | "pill" | "free">("card");
  const [inView, setInView] = useState(false);
  const lastSent = useRef<{ text: string; mode: Mode } | null>(null);
  useSpotlight(ref, revealed);

  useEffect(() => {
    if (visible) setInView(true);
  }, [visible]);

  useEffect(() => {
    if (!revealed) {
      setShape("card");
      return;
    }
    const toPill = requestAnimationFrame(() => setShape("pill"));
    const toFree = window.setTimeout(() => setShape("free"), 1050);
    const focus = window.setTimeout(() => composerFocus.current?.focus({ preventScroll: true }), 700);
    return () => {
      cancelAnimationFrame(toPill);
      clearTimeout(toFree);
      clearTimeout(focus);
    };
  }, [revealed, composerFocus]);

  const chatActive = council.messages.length > 0 || Boolean(council.streaming);
  const lastId = chatActive ? null : lastConversationId();

  const send = (text = draft, m = mode) => {
    if (!text.trim()) return;
    lastSent.current = { text, mode: m };
    council.send(text, m);
    setDraft("");
  };

  const stagger: Stagger = (delay) => ({
    className: `${inView ? "anim-stagger" : "opacity-0"} transition-opacity duration-500 ${chatActive ? "!opacity-0 pointer-events-none" : ""}`,
    style: { animationDelay: `${delay}s` },
  });

  const heading = { fontSize: "clamp(2rem, 7vw, 5.5rem)", lineHeight: 0.95, letterSpacing: "-0.03em" } as const;

  const barStyle: CSSProperties =
    shape === "card"
      ? { width: 300, height: 190, borderRadius: 16, transform: "translate(-50%, -50%) rotate(-17deg) scale(0.96)", opacity: 0, top: "48%" }
      : chatActive
        ? { width: "min(780px, calc(100vw - 24px))", borderRadius: 30, transform: "translate(-50%, -100%)", opacity: 1, top: "calc(100% - 14px)", height: shape === "pill" ? 60 : undefined }
        : { width: "min(640px, calc(100vw - 32px))", borderRadius: 30, transform: "translate(-50%, -50%)", opacity: 1, top: "48%", height: shape === "pill" ? 60 : undefined };

  return (
    <section
      ref={ref}
      aria-hidden={!visible}
      className={`absolute inset-0 z-[1] h-screen overflow-hidden transition-opacity duration-700 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ background: "radial-gradient(120% 90% at 50% 42%, #FCFCFB 0%, #F3F2F0 52%, #E4E3E0 100%)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center font-medium uppercase text-[#18161B]/[0.035]"
        style={{ fontSize: "clamp(4rem, 15vw, 14rem)", letterSpacing: "-0.02em" }}
      >
        Council
      </div>

      {/* The card's ice-blue and moss tones, revealed under the cursor; the glass refracts them. */}
      <div className={`absolute inset-0 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
        <div
          aria-hidden
          className="absolute left-1/2 top-[48%] h-[46vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(191,227,245,0.85), rgba(150,205,236,0.35) 55%, rgba(141,179,58,0.0) 100%)", opacity: chatActive ? 0.35 : 0.9, transition: "opacity 0.8s" }}
        />
        <RevealLayer
          style={{
            background:
              "radial-gradient(60% 50% at 30% 40%, rgba(141,179,58,0.55), transparent 70%), radial-gradient(55% 55% at 70% 60%, rgba(120,190,232,0.7), transparent 70%), radial-gradient(40% 40% at 50% 50%, rgba(255,255,255,0.6), transparent)",
          }}
        />
      </div>

      <div className="relative z-10 h-full">
        <h2 {...stagger(0.15)} className={`${stagger(0.15).className} absolute left-0 top-0 px-5 pt-16 font-light text-[#18161B] sm:px-10 sm:pt-28 md:px-14 md:pt-32`} style={{ ...heading, animationDelay: "0.15s" }}>
          Bring Any Idea
        </h2>

        <div {...stagger(0.3)} className={`${stagger(0.3).className} absolute right-5 top-[4.5rem] flex gap-2 sm:right-10 sm:top-28 md:right-14 md:top-32`}>
          <button
            onClick={() => {
              council.reset();
              composerFocus.current?.focus();
            }}
            className="flex items-center gap-1.5 rounded-full border border-[#18161B]/15 bg-[#18161B]/10 px-4 py-2 text-sm text-[#18161B]/80 transition-colors hover:bg-[#18161B]/15"
          >
            <Plus size={15} /> New
          </button>
          <button
            onClick={() => openDrawer("history")}
            className="hidden items-center gap-1.5 rounded-full border border-[#18161B]/15 bg-[#18161B]/10 px-4 py-2 text-sm text-[#18161B]/80 transition-colors hover:bg-[#18161B]/15 sm:flex"
          >
            <History size={15} /> Sessions
          </button>
        </div>

        <h2
          {...stagger(0.5)}
          className={`${stagger(0.5).className} absolute bottom-0 right-0 hidden px-5 pb-12 text-right font-light text-[#18161B] sm:block sm:px-10 sm:pb-16 md:px-14 md:pb-20`}
          style={{ ...heading, animationDelay: "0.5s" }}
        >
          Leave With a Plan
        </h2>

        <div {...stagger(0.7)} className={`${stagger(0.7).className} absolute bottom-0 left-0 max-w-md px-5 pb-12 sm:px-10 sm:pb-16 md:px-14 md:pb-20`}>
          <p className="text-[15px] leading-relaxed text-[#18161B]/70">
            Ask anything. The Council answers from {episodes ? `${episodes} episodes` : "every episode"}, names the founders it draws on, asks when it needs more, and tells you the next move.
          </p>
          <button onClick={() => openDrawer("memory")} className="mt-5 rounded-full bg-[#18161B] px-5 py-2.5 text-sm text-white">
            See what it knows about you
          </button>
        </div>

        {/* Conversation window */}
        <div
          className={`absolute left-1/2 z-20 w-[min(780px,calc(100vw-24px))] -translate-x-1/2 transition-all duration-700 ${
            chatActive ? "opacity-100" : "pointer-events-none translate-y-6 scale-[0.98] opacity-0"
          }`}
          style={{ top: 72, bottom: 96, transitionTimingFunction: EASE }}
        >
          {chatActive && (
            <ChatWindow
              title={council.title}
              messages={council.messages}
              streaming={council.streaming}
              error={council.error}
              episodes={episodes}
              onClose={() => council.reset(false)}
              onRetry={() => {
                const last = lastSent.current;
                if (last) {
                  council.setError(null);
                  council.send(last.text, last.mode);
                }
              }}
              onOpenMemory={() => openDrawer("memory")}
              onOpenHistory={() => openDrawer("history")}
              onReply={(r) => send(r, mode)}
            />
          )}
        </div>

        {/* The glass bar: starts where the card was, settles into a pill */}
        <div className="liquid-glass card-morph absolute left-1/2 z-30" style={barStyle} data-scroll-region>
          <div className={`transition-opacity duration-300 ${shape === "card" ? "opacity-0" : "opacity-100 delay-300"}`}>
            <Composer
              ref={composerFocus}
              value={draft}
              onChange={setDraft}
              onSend={() => send()}
              onStop={council.stop}
              busy={Boolean(council.streaming)}
              mode={mode}
              onModeChange={setMode}
              placeholder={chatActive ? "Message the Council" : undefined}
            />
          </div>
        </div>

        {!chatActive && (
          <div
            className={`absolute left-1/2 top-[calc(48%+52px)] z-20 flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-wrap justify-center gap-2 transition-all duration-700 ${
              shape === "card" ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
            style={{ transitionDelay: shape === "card" ? "0ms" : "450ms", transitionTimingFunction: EASE }}
          >
            {lastId && (
              <button
                onClick={() => council.load(lastId).catch(() => undefined)}
                className="flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_6px_18px_-8px_rgba(10,132,255,0.8)]"
              >
                <History size={14} /> Pick up where you left off
              </button>
            )}
            {STARTERS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setMode(s.mode);
                  setDraft(s.text);
                  composerFocus.current?.focus();
                }}
                className="liquid-glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] text-[#18161B]/80 transition-colors hover:text-[#18161B]"
              >
                <s.Icon size={14} strokeWidth={1.9} /> {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

    </section>
  );
}

/* ---------------------------------- App ---------------------------------- */

export default function App() {
  const [videoPhase, setVideoPhase] = useState<VideoPhase>("idle");
  const [sectionVisible, setSectionVisible] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [episodes, setEpisodes] = useState<number | null>(null);
  const council = useCouncil();
  const videoRef = useRef<HTMLVideoElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const phaseRef = useRef<VideoPhase>("idle");
  phaseRef.current = videoPhase;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    api.health().then((h) => setEpisodes(h.library?.episodes ?? null), () => undefined);
  }, []);

  const start = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    if (reducedMotion) {
      setSectionVisible(true);
      setVideoPhase("done");
      return;
    }
    const v = videoRef.current;
    const skipToCouncil = () => {
      setSectionVisible(true);
      setVideoPhase("done");
    };
    if (!v) return skipToCouncil();
    const play = () => {
      setSectionVisible(false);
      setVideoPhase("playing");
      v.currentTime = 0;
      v.play().catch(skipToCouncil);
    };
    if (v.readyState >= 3) return play();
    // Hold the hero until the transition video can actually play.
    phaseRef.current = "playing";
    let settled = false;
    const ready = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      play();
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      v.removeEventListener("canplay", ready);
      skipToCouncil();
    }, 6000);
    v.addEventListener("canplay", ready, { once: true });
    if (v.networkState !== HTMLMediaElement.NETWORK_LOADING) v.load();
  }, [reducedMotion]);

  const back = useCallback(() => {
    if (phaseRef.current !== "done") return;
    setSectionVisible(false);
    setVideoPhase("idle");
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    const inRegion = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest("[data-scroll-region]"));
    const chatOpen = () => Boolean(document.querySelector('[aria-label="Conversation with the Founders Council"]'));
    const onWheel = (e: WheelEvent) => {
      if (drawerOpen.current || inRegion(e.target)) return;
      if (e.deltaY > 0 && phaseRef.current === "idle") start();
      else if (e.deltaY < 0 && phaseRef.current === "done" && !chatOpen()) back();
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = inRegion(e.target) ? null : e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY === null || drawerOpen.current) return;
      const dy = touchY - e.changedTouches[0].clientY;
      if (dy > 40 && phaseRef.current === "idle") start();
      else if (dy < -40 && phaseRef.current === "done" && !chatOpen()) back();
      touchY = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (["ArrowDown", "PageDown", " "].includes(e.key) && phaseRef.current === "idle") {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [start, back]);

  const drawerOpen = useRef(false);
  drawerOpen.current = drawer !== null;

  const navDark = videoPhase === "done" || sectionVisible;
  const goToCouncil = () => (phaseRef.current === "idle" ? start() : composerRef.current?.focus());
  const openDrawer = (k: DrawerKind) => setDrawer(k);

  const items: NavItem[] = [
    { label: "Council", onClick: goToCouncil, active: true },
    { label: "Patterns", onClick: () => openDrawer("patterns") },
    { label: "Sessions", onClick: () => openDrawer("history") },
    { label: "Memory", onClick: () => openDrawer("memory") },
  ];

  return (
    <div className="relative h-screen overflow-hidden bg-[#F4F0ED]">
      <CouncilSection
        visible={sectionVisible}
        revealed={videoPhase === "done"}
        episodes={episodes}
        openDrawer={openDrawer}
        composerFocus={composerRef}
        council={council}
      />

      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-[2] h-full w-full object-cover transition-opacity duration-500 ${videoPhase === "playing" ? "opacity-100" : "opacity-0"}`}
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= 2 && !sectionVisible) setSectionVisible(true);
        }}
        onEnded={() => setVideoPhase("done")}
      />

      <HeroSection hidden={videoPhase !== "idle"} episodes={episodes} onStart={start} />

      <Nav dark={navDark} items={items} onAccount={() => openDrawer("memory")} onStart={goToCouncil} startLabel="Start a Session" />

      {drawer && (
        <Drawer
          kind={drawer}
          onClose={() => setDrawer(null)}
          activeId={council.conversationId}
          onOpenConversation={(id) => {
            if (phaseRef.current === "idle") start();
            void council.load(id).catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
