import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { LogOut, Menu, Moon, Sun, X, User, MessagesSquare, Flame, HelpCircle, ListChecks, History } from "lucide-react";
import { Composer } from "./council/Composer";
import { DUSK_MS, setNight, useNight } from "./theme";
import { SlotLine, useSaying } from "./SlotHeadline";
import type { QaState } from "./council/QuestionFocus";
import { BOARD_CHIP, ChatWindow, LOGO_PATH } from "./council/ChatWindow";
import { Drawer, type DrawerKind } from "./council/Drawer";
import { Onboarding, hasSeenOnboarding } from "./council/Onboarding";
import { About } from "./council/About";
import { lastConversationId, useCouncil } from "./council/useCouncil";
import { api, AUTH_EVENT, type Mode } from "./council/api";
import { AccessGate } from "./council/AccessGate";

type Flash = { from: number; to: number; name: string; fact: string };
type Cut = {
  hero: string;
  reveal: string;
  video: string;
  /** The same scene after dark: stars, moonlight, headlights and glowing screens. */
  night: { hero: string; reveal: string; video: string } & Partial<Pick<Cut, "whiteFrom" | "montage" | "flashes">>;
  /** Seconds where the camera passes through the glass: scrolling scrubs up to here, then it plays. */
  portalAt: number;
  /** From here the video is white space, so the nav switches to dark text. */
  whiteFrom: number;
  /** The montage plays slower so each glimpse can register. */
  montage: { from: number; to: number; rate: number };
  /** Founder names timed to the montage glimpses. */
  flashes: Flash[];
};

const FOUNDERS = {
  rockefeller: { name: "John D. Rockefeller", fact: "Took over the world's oil markets" },
  edison: { name: "Thomas Edison", fact: "1,093 patents" },
  ford: { name: "Henry Ford", fact: "Twenty years of experiments before the first Model T" },
  johnson: { name: "Kelly Johnson", fact: "A jet fighter in 143 days, with 120 people" },
  walton: { name: "Sam Walton", fact: "Lowest costs in retail, 25 years running" },
  musk: { name: "Elon Musk", fact: "One last Falcon 1. Build it, then fly it" },
};

/** Widescreen and phone each get their own hero and transition, timed to their own montage cuts. */
const CUTS: Record<"landscape" | "portrait", Cut> = {
  landscape: {
    hero: "/media/hero.webp",
    reveal: "/media/hero-reveal.webp",
    video: "/media/transition.mp4",
    night: {
      hero: "/media/hero-night.webp",
      reveal: "/media/hero-night-reveal.webp",
      video: "/media/transition-night.mp4",
      montage: { from: 4.2, to: 6.25, rate: 0.55 },
      flashes: [
        { from: 4.2, to: 4.62, ...FOUNDERS.rockefeller },
        { from: 4.62, to: 4.75, ...FOUNDERS.edison },
        { from: 4.75, to: 5.0, ...FOUNDERS.ford },
        { from: 5.0, to: 5.12, ...FOUNDERS.johnson },
        { from: 5.12, to: 5.25, ...FOUNDERS.edison },
        { from: 5.25, to: 5.5, ...FOUNDERS.walton },
        { from: 5.5, to: 5.62, ...FOUNDERS.johnson },
        { from: 5.62, to: 5.75, ...FOUNDERS.walton },
        { from: 5.75, to: 6.25, ...FOUNDERS.musk },
      ],
    },
    portalAt: 4.0,
    whiteFrom: 4.45,
    montage: { from: 4.85, to: 6.38, rate: 0.55 },
    flashes: [
      { from: 4.86, to: 5.11, ...FOUNDERS.rockefeller },
      { from: 5.11, to: 5.37, ...FOUNDERS.ford },
      { from: 5.37, to: 5.66, ...FOUNDERS.edison },
      { from: 5.66, to: 5.78, ...FOUNDERS.johnson },
      { from: 5.78, to: 5.87, ...FOUNDERS.walton },
      { from: 5.87, to: 5.95, ...FOUNDERS.musk },
      { from: 5.95, to: 6.03, ...FOUNDERS.johnson },
      { from: 6.03, to: 6.16, ...FOUNDERS.walton },
      { from: 6.16, to: 6.38, ...FOUNDERS.musk },
    ],
  },
  portrait: {
    hero: "/media/hero-portrait.webp",
    reveal: "/media/hero-portrait-reveal.webp",
    video: "/media/transition-portrait.mp4",
    night: {
      hero: "/media/hero-portrait-night.webp",
      reveal: "/media/hero-portrait-night-reveal.webp",
      video: "/media/transition-portrait-night.mp4",
      montage: { from: 4.15, to: 5.98, rate: 0.55 },
      flashes: [
        { from: 4.15, to: 4.53, ...FOUNDERS.rockefeller },
        { from: 4.53, to: 4.88, ...FOUNDERS.edison },
        { from: 4.88, to: 5.22, ...FOUNDERS.johnson },
        { from: 5.22, to: 5.6, ...FOUNDERS.walton },
        { from: 5.6, to: 5.98, ...FOUNDERS.musk },
      ],
    },
    portalAt: 3.7,
    whiteFrom: 4.1,
    montage: { from: 4.62, to: 6.12, rate: 0.55 },
    flashes: [
      { from: 4.66, to: 4.87, ...FOUNDERS.rockefeller },
      { from: 4.87, to: 5.03, ...FOUNDERS.edison },
      { from: 5.03, to: 5.37, ...FOUNDERS.ford },
      { from: 5.37, to: 5.78, ...FOUNDERS.johnson },
      { from: 5.78, to: 5.95, ...FOUNDERS.walton },
      { from: 5.95, to: 6.12, ...FOUNDERS.musk },
    ],
  },
};

/** Chosen once per visit: phones (taller than wide) get the portrait cut. */
const CUT = typeof window !== "undefined" && window.innerWidth / window.innerHeight < 0.8 ? CUTS.portrait : CUTS.landscape;
const BG_IMAGE_1 = CUT.hero;
const BG_IMAGE_2 = CUT.reveal;
const VIDEO_SRC = CUT.video;
/** Fallback for portrait screens still on the widescreen cut: the real bar takes over mid-tumble. */
const PORTRAIT_HANDOFF = CUT === CUTS.landscape ? 5.85 : Infinity;
/** On-screen debug line when the page is opened with ?debug=1. */
const dbg = (m: string) => (window as unknown as { __dbg?: (m: string) => void }).__dbg?.(`${(performance.now() / 1000).toFixed(1)} ${m}`);
const isPortrait = () => typeof window !== "undefined" && window.innerWidth / window.innerHeight < 1;

/** `?frame=last` renders only the studio and the empty glass bar: the transition video's final frame. */
const FRAME_MODE = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("frame") === "last";

const SPOTLIGHT_R = 260;
const GRID_CELL = 48;
const EASE = "cubic-bezier(0.16,1,0.3,1)";

type VideoPhase = "idle" | "scrubbing" | "playing" | "done";

/** Scrolling scrubs the approach; once the camera is through the glass (this many seconds in), the rest plays on its own. */
const PORTAL_AT = CUT.portalAt;
const SECONDS_PER_WHEEL_PX = PORTAL_AT / 1200;
// a phone flick shouldn't fly through the whole approach: it takes a few deliberate swipes
const SECONDS_PER_TOUCH_PX = PORTAL_AT / 1500;

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
      <path d={LOGO_PATH} fill={dark ? "rgb(var(--ink))" : "#fff"} className="transition-colors duration-500" />
    </svg>
  );
}

/* ---------------------------------- Nav ---------------------------------- */

function ThemeToggle({ fg }: { fg: string }) {
  const night = useNight();
  const toggle = () => setNight(!night);
  return (
    <button
      onClick={toggle}
      aria-label={night ? "Switch to day theme" : "Switch to night theme"}
      title={night ? "Day theme" : "Night theme"}
      className={`relative h-9 w-9 rounded-full transition-colors duration-500 hover:bg-ink/[0.06] ${fg}`}
    >
      <Sun size={19} strokeWidth={1.9} className={`absolute inset-0 m-auto transition-all duration-500 ${night ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} />
      <Moon size={18} strokeWidth={1.9} className={`absolute inset-0 m-auto transition-all duration-500 ${night ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
    </button>
  );
}

type NavItem = { label: string; onClick: () => void; active?: boolean };

/** Accounts sign in with a username; the app greets them by first name. */
const FIRST_NAMES: Record<string, string> = { bobbysi: "Bobby", rj: "RJ", dan: "Dan" };
const firstName = (user: string) => FIRST_NAMES[user.toLowerCase()] ?? user.replace(/[^A-Za-z].*$/, "");

function AccountButton({ fg, user, onSignOut }: { fg: string; user: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !(e.target instanceof Element && e.target.closest("[data-account-menu]")) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="relative" data-account-menu>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Signed in as ${user}`}
        aria-expanded={open}
        className={`flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium transition-colors duration-500 hover:bg-ink/[0.06] ${fg}`}
      >
<span className="text-[15px] font-medium tracking-[-0.01em]">{firstName(user)}</span>
      </button>
      {open && (
        <div className="liquid-glass bubble-in absolute right-0 top-11 z-10 w-48 rounded-[18px] p-1.5" style={{ background: "rgb(var(--paper) / 0.94)" }}>
          <p className="px-3 pb-1.5 pt-1 text-[12px] text-ink/50">Signed in as <span className="font-medium text-ink">{firstName(user)}</span></p>
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[14px] text-ink hover:bg-ink/[0.05]"
          >
            <LogOut size={15} className="text-ink/60" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Nav({ dark, onWhite = false, user, onSignOut, items, onAccount, onStart, startLabel }: { dark: boolean; onWhite?: boolean; user: string | null; onSignOut: () => void; items: NavItem[]; onAccount: () => void; onStart: () => void; startLabel: string }) {
  const [open, setOpen] = useState(false);
  // over the video's white frames the text stays dark, whatever the theme
  const fg = onWhite ? "text-[#18161B]" : dark ? "text-ink" : "text-white";
  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 md:px-10">
        <a href="/" className="flex items-center gap-2.5" aria-label="Founders Council home">
          <Logo dark={dark} />
          <span className={`text-sm font-medium uppercase tracking-wide transition-colors duration-500 ${fg}`}>Founders Council</span>
        </a>

        <div
          className={`absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5 py-1.5 backdrop-blur-md transition-colors duration-500 md:flex ${
            dark ? "liquid-glass" : "bg-paper/10"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors duration-500 ${
                item.active
                  ? dark
                    ? "bg-ink text-paper"
                    : "bg-paper text-ink"
                  : dark
                    ? "text-ink/70 hover:text-ink"
                    : "text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle fg={fg} />
          {user && <AccountButton fg={fg} user={user} onSignOut={onSignOut} />}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className={`relative h-9 w-9 md:hidden ${fg}`}
          >
            <Menu size={22} className={`absolute inset-0 m-auto transition-all duration-300 ${open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"}`} />
            <X size={22} className={`absolute inset-0 m-auto transition-all duration-300 ${open ? "rotate-0 opacity-100 text-white" : "-rotate-90 opacity-0"}`} />
          </button>
        </div>
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
      </div>
    </>
  );
}

/* ----------------------------- Founder flashes ----------------------------- */

/** Names and wins that flash over the white-space part of the transition, timed to the video. */
function FounderFlashes({
  video,
  active,
  night,
  onWhite,
  onHandoff,
}: {
  video: RefObject<HTMLVideoElement>;
  active: boolean;
  /** The night video has its own cut timings. */
  night: boolean;
  onWhite: (white: boolean) => void;
  onHandoff: () => void;
}) {
  const [index, setIndex] = useState(-1);
  const FLASHES = (night && CUT.night.flashes) || CUT.flashes;
  const MONTAGE = (night && CUT.night.montage) || CUT.montage;
  const WHITE_FROM = (night && CUT.night.whiteFrom) || CUT.whiteFrom;
  useEffect(() => {
    if (!active) {
      setIndex(-1);
      onWhite(false);
      if (video.current) video.current.playbackRate = 1;
      return;
    }
    let raf = 0;
    const tick = () => {
      const v = video.current;
      const t = v?.currentTime ?? 0;
      setIndex(FLASHES.findIndex((f) => t >= f.from && t < f.to));
      onWhite(t >= WHITE_FROM);
      if (t >= PORTRAIT_HANDOFF && isPortrait()) onHandoff();
      if (v) {
        const rate = t >= MONTAGE.from && t < MONTAGE.to ? MONTAGE.rate : 1;
        if (v.playbackRate !== rate) v.playbackRate = rate;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, video, onWhite, onHandoff, FLASHES, MONTAGE, WHITE_FROM]);

  return (
    <div aria-hidden className="font-helvetica-neue pointer-events-none fixed inset-x-0 bottom-[16%] z-[2] flex justify-center px-6">
      {FLASHES.map((f, i) => (
        <div
          key={`${f.name}-${f.from}`}
          className="absolute flex flex-col items-center text-center transition-all duration-150"
          style={{ opacity: i === index ? 1 : 0, transform: `translateY(${i === index ? 0 : 8}px)`, filter: i === index ? "none" : "blur(4px)" }}
        >
          <span className="font-light text-ink" style={{ fontSize: "clamp(1.6rem, 3.6vw, 3rem)", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {f.name}
          </span>
          <span className="mt-2 text-[14px] text-ink/60 sm:text-[15px]">{f.fact}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Hero --------------------------------- */

function HeroSection({ hidden }: { hidden: boolean }) {
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
      className={`font-helvetica-neue absolute inset-0 z-[3] h-full overflow-clip bg-[#0A0B11] transition-opacity duration-700 ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
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
      {/* Night falls over the same scene: the sky darkens first, then the meadow, then the lights take over. */}
      <div className="dusk-layer absolute inset-0">
        <div className="anim-fade absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${CUT.night.hero})`, animationDelay: "0.1s" }} />
        <RevealLayer className="bg-cover bg-center" style={{ backgroundImage: `url(${CUT.night.reveal})` }} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-72 bg-gradient-to-t from-[#0A0B11] via-[#0A0B11]/60 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-50 px-6 pb-12 sm:px-10 sm:pb-16 md:px-14 md:pb-20">
        <h1
          className="anim-stagger font-light text-white"
          style={{ fontSize: "clamp(2.2rem, 5.4vw, 5rem)", lineHeight: 0.95, letterSpacing: "-0.03em", animationDelay: "0.4s" }}
        >
          Learn From the Greats
          <br />
          Without Starting Over
        </h1>
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
  landing,
}: {
  council: ReturnType<typeof useCouncil>;
  landing: boolean;
  visible: boolean;
  revealed: boolean;
  episodes: number | null;
  openDrawer: (k: DrawerKind) => void;
  composerFocus: RefObject<HTMLTextAreaElement>;
}) {
  const ref = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("counsel");
  const [shape, setShape] = useState<"hidden" | "free">(FRAME_MODE ? "free" : "hidden");
  const [inView, setInView] = useState(false);
  const lastSent = useRef<{ text: string; mode: Mode } | null>(null);
  useSpotlight(ref, revealed);

  useEffect(() => {
    if (revealed) setInView(true);
  }, [revealed]);

  useEffect(() => {
    if (!revealed) {
      setShape("hidden");
      return;
    }
    setShape("free");
    // On phones, don't raise the keyboard by itself: it would cover the screen and take over swipes.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const focus = window.setTimeout(() => !touch && composerFocus.current?.focus({ preventScroll: true }), 400);
    return () => clearTimeout(focus);
  }, [revealed, composerFocus]);

  const chatActive = council.messages.length > 0 || Boolean(council.streaming);
  const [pickUpGone, setPickUpGone] = useState(false);
  const [menuSpace, setMenuSpace] = useState(0);
  const lastId = chatActive || pickUpGone ? null : lastConversationId();

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  // a reply belongs to the conversation it quotes: leaving or switching conversations drops it
  useEffect(() => setReplyingTo(null), [council.conversationId]);

  // "Ask me first": the Council's questions, answered one at a time.
  const [qa, setQa] = useState<QaState | null>(null);
  const qaDone = useRef(new Set<string>());
  const finishQa = (state: QaState) => {
    qaDone.current.add(state.messageId);
    setQa(null);
    if (state.answers.length) council.send("My answers", "ask", { answers: state.answers });
  };
  const advanceQa = (answer: string | null) => {
    if (!qa) return;
    const next = { ...qa, answers: answer ? [...qa.answers, { q: qa.questions[qa.index], a: answer }] : qa.answers, index: qa.index + 1 };
    if (next.index >= qa.questions.length) finishQa(next);
    else setQa(next);
    window.setTimeout(() => composerFocus.current?.focus(), 30);
  };
  useEffect(() => {
    if (!chatActive || mode !== "ask") setQa(null);
  }, [chatActive, mode]);
  useEffect(() => {
    if (!qa) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      qaDone.current.add(qa.messageId);
      setQa(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qa]);

  const send = (text = draft, m = mode) => {
    if (!text.trim()) return;
    if (qa) {
      advanceQa(text.trim());
      setDraft("");
      return;
    }
    lastSent.current = { text, mode: m };
    council.send(text, m, replyingTo && chatActive ? { replyTo: replyingTo } : {});
    setDraft("");
    setReplyingTo(null);
  };

  const saying = useSaying(inView && !chatActive && !FRAME_MODE);

  const stagger: Stagger = (delay) => ({
    className: `${inView ? "anim-stagger" : "opacity-0"} transition-opacity duration-500 ${chatActive || FRAME_MODE ? "!opacity-0 pointer-events-none" : ""}`,
    style: { animationDelay: `${delay}s` },
  });

  // the longest saying is about 12em wide, so the size is capped to keep every line on screen
  const heading = { fontSize: "min(clamp(2rem, 7vw, 5.5rem), calc((100vw - 48px) / 12))", lineHeight: 0.95, letterSpacing: "-0.03em" } as const;

  // `?frame=last&barw=358` pins the bar width when rendering the phone video's final frame.
  const frameBarWidth = FRAME_MODE ? Number(new URLSearchParams(window.location.search).get("barw")) || null : null;
  const barStyle: CSSProperties = frameBarWidth
    ? { width: frameBarWidth, borderRadius: 30, transform: "translate(-50%, -50%)", top: "48%" }
    : chatActive
    ? { width: "min(780px, calc(100vw - 24px))", borderRadius: 30, transform: "translate(-50%, -100%)", top: "calc(100% - 14px)" }
    : { width: "min(640px, calc(100vw - 32px))", borderRadius: 30, transform: "translate(-50%, -50%)", top: "48%" };

  return (
    <section
      ref={ref}
      aria-hidden={!visible}
      className={`absolute inset-0 z-[1] h-full overflow-hidden transition-opacity duration-700 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ background: "var(--council-bg-day)" }}
    >
      <div aria-hidden className="dusk-fade pointer-events-none absolute inset-0" style={{ background: "var(--council-bg-night)" }} />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 flex select-none items-center justify-center font-medium uppercase text-ink/[0.035] transition-opacity duration-700 ${revealed && !FRAME_MODE ? "opacity-100" : "opacity-0"}`}
        style={{ fontSize: "clamp(4rem, 15vw, 14rem)", letterSpacing: "-0.02em" }}
      >
        Council
      </div>

      {/* Colour light drifting behind the glass */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-1000 ${revealed ? "opacity-100" : "opacity-0"}`}>
        <div className="glass-light a" style={{ left: "8%", top: "18%", width: "38vmax", height: "30vmax", background: "radial-gradient(closest-side, rgba(150,210,245,0.85), rgba(150,210,245,0))" }} />
        <div className="glass-light b" style={{ right: "4%", top: "8%", width: "34vmax", height: "28vmax", background: "radial-gradient(closest-side, rgba(255,205,170,0.7), rgba(255,205,170,0))" }} />
        <div className="glass-light c" style={{ left: "30%", bottom: "-6%", width: "40vmax", height: "30vmax", background: "radial-gradient(closest-side, rgba(170,205,120,0.5), rgba(170,205,120,0))" }} />
      </div>

      {/* The card's ice-blue and moss tones, revealed under the cursor; the glass refracts them. */}
      <div className={`night-soft absolute inset-0 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
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
        {/* One founder's way of working, three words over three, re-spun like a slot reel every 30 seconds. */}
        <h2
          className={`${inView ? "headline-in" : "opacity-0"} absolute left-0 top-0 px-5 pt-16 font-light text-ink transition-opacity duration-700 sm:px-10 sm:pt-28 md:px-14 md:pt-32 ${chatActive || FRAME_MODE ? "pointer-events-none !opacity-0" : ""}`}
          style={heading}
          aria-label={`${saying.top.join(" ")} ${saying.bottom.join(" ")}. ${saying.founder}`}
        >
          <span aria-hidden>
            <SlotLine words={saying.top} />
            <span className="block sm:hidden">
              <SlotLine words={saying.bottom} delay={900} />
            </span>
          </span>
        </h2>
        <h2
          aria-hidden
          className={`${inView ? "headline-in" : "opacity-0"} absolute bottom-0 right-0 hidden px-5 pb-12 text-right font-light text-ink transition-opacity duration-700 sm:block sm:px-10 sm:pb-16 md:px-14 md:pb-20 ${chatActive || FRAME_MODE ? "pointer-events-none !opacity-0" : ""}`}
          style={{ ...heading, animationDelay: "0.9s" }}
        >
          <span key={saying.founder} className="founder-credit mb-3 block text-[13px] font-normal tracking-normal text-ink/45" style={{ lineHeight: 1.2 }}>
            {saying.founder}
          </span>
          <SlotLine words={saying.bottom} delay={900} align="right" />
        </h2>


        {/* Conversation window */}
        <div
          className={`absolute left-1/2 z-20 w-[min(780px,calc(100vw-24px))] -translate-x-1/2 transition-all duration-700 ${
            chatActive ? "opacity-100" : "pointer-events-none translate-y-6 scale-[0.98] opacity-0"
          }`}
          style={{ top: 72, bottom: replyingTo ? 146 : 96, transitionTimingFunction: EASE }}
        >
          {chatActive && (
            <ChatWindow
              title={council.title}
              voices={council.voices}
              messages={council.messages}
              streaming={council.streaming}
              error={council.error}
              episodes={episodes}
              onClose={() => {
                setReplyingTo(null);
                council.reset(false);
              }}
              onRetry={() => {
                const last = lastSent.current;
                if (last) {
                  council.setError(null);
                  council.send(last.text, last.mode);
                }
              }}
              onOpenMemory={() => openDrawer("memory")}
              onOpenHistory={() => openDrawer("history")}
              onReply={(r) => (r === BOARD_CHIP ? send(r, "board") : send(r, mode))}
              onReplyTo={(text) => {
                setReplyingTo(text);
                window.setTimeout(() => composerFocus.current?.focus(), 30);
              }}
              onExpand={(text) => council.send("Explain this in more depth", mode, { replyTo: text, expand: true })}
              conversationId={council.conversationId}
              askMode={mode === "ask"}
              qa={qa}
              onQuestions={(messageId, questions) => {
                if (qaDone.current.has(messageId) || qa?.messageId === messageId) return;
                setReplyingTo(null);
                setQa({ messageId, questions, index: 0, answers: [] });
                window.setTimeout(() => composerFocus.current?.focus(), 60);
              }}
              onSkipQuestion={() => advanceQa(null)}
              onNewChat={() => {
                setQa(null);
                setReplyingTo(null);
                council.reset(false);
                window.setTimeout(() => composerFocus.current?.focus(), 50);
              }}
            />
          )}
        </div>

        {/* The glass bar: starts where the card was, settles into a pill */}
        <div
          className={`liquid-glass card-morph absolute left-1/2 z-30 ${shape === "hidden" ? "pointer-events-none opacity-0" : "opacity-100"} ${landing && shape !== "hidden" && !chatActive ? "bar-land" : ""}`}
          style={barStyle}
          data-scroll-region
        >
          <div className={`transition-opacity duration-300 ${shape === "hidden" || FRAME_MODE ? "opacity-0" : "opacity-100 delay-200"}`}>
            <Composer
              ref={composerFocus}
              value={draft}
              onChange={setDraft}
              onSend={() => send()}
              onStop={council.stop}
              busy={Boolean(council.streaming)}
              mode={mode}
              onModeChange={setMode}
              placeholder={chatActive ? (qa ? "Type your answer" : replyingTo ? "Your reply" : "Message the Council") : undefined}
              replyingTo={chatActive ? replyingTo : null}
              onCancelReply={() => setReplyingTo(null)}
              onMenuSpace={setMenuSpace}
            />
          </div>
        </div>

        {!chatActive && !FRAME_MODE && (
          <div
            className={`absolute left-1/2 top-[calc(48%+52px)] z-20 flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-wrap justify-center gap-2 transition-all duration-700 ${
              shape === "hidden" ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
            style={{
              // Fades in after the bar lands; slides down under the mode menu and back up as it closes.
              transition: `opacity 700ms ${EASE} ${shape === "hidden" ? 0 : 450}ms, transform 700ms ${EASE} ${shape === "hidden" ? 0 : 450}ms, margin-top 420ms ${EASE}`,
              marginTop: menuSpace,
            }}
          >
            {lastId && (
              <button
                onClick={() => council.load(lastId).catch(() => setPickUpGone(true))}
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
                className="liquid-glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] text-ink/80 transition-colors hover:text-ink"
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
  const [videoPhase, setVideoPhase] = useState<VideoPhase>(FRAME_MODE ? "done" : "idle");
  const [sectionVisible, setSectionVisible] = useState(FRAME_MODE);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [videoWhite, setVideoWhite] = useState(false);
  const [episodes, setEpisodes] = useState<number | null>(null);
  const council = useCouncil();
  // Day and night each have their own transition video; videoRef always points at the one on screen.
  const night = useNight();
  const dayVideo = useRef<HTMLVideoElement>(null);
  const nightVideo = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoNight, setVideoNight] = useState(night);
  const [crossfading, setCrossfading] = useState(false);
  useLayoutEffect(() => {
    if (!videoRef.current) videoRef.current = night ? nightVideo.current : dayVideo.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const from = videoRef.current;
    const to = night ? nightVideo.current : dayVideo.current;
    if (!from || !to || from === to) return;
    // Hand the moment over: same time, same speed, then let night (or day) fade in over it.
    const at = from.currentTime;
    const seek = () => {
      try {
        to.currentTime = at;
      } catch {
        /* not seekable yet */
      }
    };
    if (to.readyState >= 1) seek();
    else {
      to.addEventListener("loadedmetadata", seek, { once: true });
      to.preload = "auto";
      to.load();
    }
    to.playbackRate = from.playbackRate;
    if (!from.paused) void to.play().catch(() => undefined);
    videoRef.current = to;
    setVideoNight(night);
    setCrossfading(true);
    const t = window.setTimeout(() => {
      from.pause();
      setCrossfading(false);
    }, DUSK_MS);
    return () => clearTimeout(t);
  }, [night]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const phaseRef = useRef<VideoPhase>("idle");
  phaseRef.current = videoPhase;
  // The intro and its animations play for everyone, including phones with Reduce Motion on (the owner wants the full experience).
  const reducedMotion = false;

  const [locked, setLocked] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  const [about, setAbout] = useState(false);
  const [sessionKnown, setSessionKnown] = useState(false);
  // the welcome appears once per account on this device, right after signing in
  useEffect(() => {
    if (sessionKnown && !locked && !FRAME_MODE && !hasSeenOnboarding(user)) setIntro(true);
  }, [sessionKnown, locked, user]);
  const loadLibrary = useCallback(() => {
    api.health().then((h) => setEpisodes(h.library?.episodes ?? null), () => undefined);
  }, []);
  useEffect(() => {
    api.session().then(
      (s) => {
        setUser(s.user);
        setSessionKnown(true);
        if (s.authRequired && !s.authenticated) setLocked(true);
        else loadLibrary();
      },
      () => undefined,
    );
    const onAuth = () => setLocked(true);
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [loadLibrary]);

  const [videoReady, setVideoReady] = useState(false);
  const manualRaf = useRef(0);

  /** Plays the transition; if the browser refuses (e.g. iPhone Low Power Mode), steps the frames itself. */
  const playVideo = useCallback((onFail: () => void) => {
    const v = videoRef.current;
    if (!v) return onFail();
    cancelAnimationFrame(manualRaf.current);
    v.play().catch((err) => {
      dbg(`play failed rs=${v.readyState} ${err?.name}`);
      if (v.readyState < 1) return onFail();
      let last = performance.now();
      const step = (now: number) => {
        if (phaseRef.current !== "playing") return;
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        const next = v.currentTime + dt * (v.playbackRate || 1);
        if (!v.seeking) v.currentTime = Math.min(next, v.duration || next);
        if (v.duration && v.currentTime >= v.duration - 0.03) {
          setSectionVisible(true);
          setVideoPhase("done");
          return;
        }
        manualRaf.current = requestAnimationFrame(step);
      };
      manualRaf.current = requestAnimationFrame(step);
    });
  }, []);

  // iPhones only load video after a touch: the first tap or swipe unlocks and loads it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const markReady = () => setVideoReady(true);
    if (v.readyState >= 2) markReady();
    v.addEventListener("loadeddata", markReady);
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      v.muted = true;
      if (v.readyState < 2 && v.networkState !== HTMLMediaElement.NETWORK_LOADING) v.load();
      if (phaseRef.current === "idle") {
        v.play()
          .then(() => {
            if (phaseRef.current !== "playing") {
              v.pause();
              if (phaseRef.current === "idle") v.currentTime = 0;
            }
          })
          .catch(() => undefined);
      }
    };
    const events = ["touchstart", "touchend", "pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    return () => {
      v.removeEventListener("loadeddata", markReady);
      events.forEach((e) => window.removeEventListener(e, unlock));
    };
  }, []);

  const start = useCallback(() => {
    dbg(`start phase=${phaseRef.current} rs=${videoRef.current?.readyState}`);
    if (phaseRef.current !== "idle") return;
    if (reducedMotion) {
      setSectionVisible(true);
      setVideoPhase("done");
      return;
    }
    const v = videoRef.current;
    const skipToCouncil = () => {
      dbg("skipToCouncil");
      setSectionVisible(true);
      setVideoPhase("done");
    };
    if (!v) return skipToCouncil();
    const play = () => {
      setSectionVisible(false);
      setVideoPhase("playing");
      v.currentTime = 0;
      playVideo(skipToCouncil);
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
  }, [reducedMotion, playVideo]);

  const back = useCallback(() => {
    if (phaseRef.current !== "done" && phaseRef.current !== "scrubbing") return;
    setSectionVisible(false);
    setVideoPhase("idle");
    setLanding(false);
    scrub.current.target = 0;
    scrub.current.shown = 0;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  }, []);

  const [landing, setLanding] = useState(false);
  const landEarly = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "done";
    setLanding(true);
    setSectionVisible(true);
    setVideoPhase("done");
    videoRef.current?.pause();
  }, []);

  /* ---- Scroll-scrubbed approach to the portal ---- */
  const scrub = useRef({ target: 0, shown: 0 });

  /** Hands over from scrubbing to normal playback once the camera passes through the glass. */
  const enterPortal = useCallback(() => {
    const v = videoRef.current;
    dbg(`enterPortal rs=${v?.readyState} t=${v?.currentTime.toFixed(2)}`);
    if (!v || phaseRef.current !== "scrubbing") return;
    phaseRef.current = "playing";
    setVideoPhase("playing");
    playVideo(() => {
      setSectionVisible(true);
      setVideoPhase("done");
    });
  }, [playVideo]);

  const nudge = useCallback(
    (seconds: number) => {
      const v = videoRef.current;
      if (!v || reducedMotion) {
        dbg(`nudge->start v=${Boolean(v)} reduced=${reducedMotion}`);
        return seconds > 0 ? start() : undefined;
      }
      if (phaseRef.current === "idle") {
        if (seconds <= 0) return;
        v.pause();
        if (v.readyState >= 1) v.currentTime = 0;
        scrub.current = { target: 0, shown: 0 };
        phaseRef.current = "scrubbing";
        setSectionVisible(false);
        setVideoPhase("scrubbing");
      }
      if (phaseRef.current !== "scrubbing") return;
      const next = scrub.current.target + seconds;
      if (next <= 0 && seconds < 0 && scrub.current.shown < 0.05) return back();
      scrub.current.target = Math.min(Math.max(next, 0), PORTAL_AT);
      if (scrub.current.target >= PORTAL_AT) enterPortal();
    },
    [start, back, enterPortal, reducedMotion],
  );

  // Ease the video toward the scroll position, one seek at a time.
  useEffect(() => {
    if (videoPhase !== "scrubbing") return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const st = scrub.current;
      if (v && phaseRef.current === "scrubbing") {
        st.shown += (st.target - st.shown) * 0.16;
        if (Math.abs(st.target - st.shown) < 0.004) st.shown = st.target;
        if (v.readyState >= 1 && !v.seeking && Math.abs(v.currentTime - st.shown) > 0.02) v.currentTime = st.shown;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoPhase]);

  useEffect(() => {
    const inRegion = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest("[data-scroll-region]"));
    const chatOpen = () => Boolean(document.querySelector('[aria-label="Conversation with the Founders Council"]'));
    const onWheel = (e: WheelEvent) => {
      if (drawerOpen.current || inRegion(e.target)) return;
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      const phase = phaseRef.current;
      if (phase === "idle" || phase === "scrubbing") nudge(px * SECONDS_PER_WHEEL_PX);
      else if (px < 0 && phase === "done" && !chatOpen()) back();
    };
    let touchY: number | null = null;
    let touchStartY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = inRegion(e.target) ? null : e.touches[0].clientY;
      touchStartY = touchY;
    };
    const onTouchMove = (e: TouchEvent) => {
      // Outside the chat and panels, stop Safari from bouncing or pulling to refresh.
      if (!inRegion(e.target) && e.cancelable) e.preventDefault();
      if (touchY === null || drawerOpen.current) return;
      const y = e.touches[0].clientY;
      const phase = phaseRef.current;
      if (phase === "idle" || phase === "scrubbing") nudge((touchY - y) * SECONDS_PER_TOUCH_PX);
      touchY = y;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartY === null || drawerOpen.current) return;
      const dy = touchStartY - e.changedTouches[0].clientY;
      if (dy < -40 && phaseRef.current === "done" && !chatOpen()) back();
      touchY = touchStartY = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!["ArrowDown", "PageDown", " "].includes(e.key)) return;
      if (phaseRef.current === "idle") {
        e.preventDefault();
        start();
      } else if (phaseRef.current === "scrubbing") {
        e.preventDefault();
        nudge(PORTAL_AT);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [start, back, nudge]);

  // Keep the layout above the on-screen keyboard on phones.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Only shrink for the keyboard; otherwise fill the window so no strip of background shows below.
    const fit = () => {
      const root = document.documentElement.style;
      if (window.innerHeight - vv.height > 120) root.setProperty("--app-h", `${Math.round(vv.height)}px`);
      else root.removeProperty("--app-h");
    };
    fit();
    vv.addEventListener("resize", fit);
    return () => vv.removeEventListener("resize", fit);
  }, []);

  const drawerOpen = useRef(false);
  drawerOpen.current = drawer !== null || locked || intro || about;

  const navDark = videoPhase === "done" || sectionVisible || (videoPhase === "playing" && videoWhite);
  const goToCouncil = () => (phaseRef.current === "idle" ? start() : composerRef.current?.focus());
  const openDrawer = (k: DrawerKind) => setDrawer(k);

  const items: NavItem[] = [
    { label: "Council", onClick: goToCouncil, active: true },
    { label: "Sessions", onClick: () => openDrawer("history") },
    { label: "About", onClick: () => setAbout(true) },
  ];

  return (
    <div className="relative overflow-hidden bg-[#0A0B11]" style={{ height: "var(--app-h, 100dvh)" }}>
      <CouncilSection
        visible={sectionVisible}
        revealed={videoPhase === "done"}
        episodes={episodes}
        openDrawer={openDrawer}
        composerFocus={composerRef}
        council={council}
        landing={landing}
      />

      {([false, true] as const).map((isNightVideo) => {
        const showing = videoPhase === "playing" || (videoPhase === "scrubbing" && videoReady);
        const active = isNightVideo === videoNight;
        return (
          <video
            key={isNightVideo ? "night" : "day"}
            ref={isNightVideo ? nightVideo : dayVideo}
            src={isNightVideo ? CUT.night.video : VIDEO_SRC}
            muted
            playsInline
            preload={active ? "auto" : "metadata"}
            aria-hidden
            className="theme-video pointer-events-none fixed inset-0 h-full w-full object-cover"
            style={{
              zIndex: active ? 2 : 1,
              opacity: showing && (active || crossfading) ? 1 : 0,
              transition: crossfading ? `opacity ${DUSK_MS}ms ease-in-out` : "opacity 500ms",
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v !== videoRef.current) return;
              if (v.duration && v.currentTime >= v.duration - 1 && !sectionVisible) setSectionVisible(true);
            }}
            onEnded={(e) => e.currentTarget === videoRef.current && setVideoPhase("done")}
            onLoadedData={(e) => dbg(`loadeddata ${isNightVideo ? "night" : "day"} rs=${e.currentTarget.readyState}`)}
            onError={() => dbg(`video error ${isNightVideo ? "night" : "day"}`)}
          />
        );
      })}

      <FounderFlashes video={videoRef} night={videoNight} active={videoPhase === "playing"} onWhite={setVideoWhite} onHandoff={landEarly} />

      <HeroSection hidden={videoPhase !== "idle" && (videoReady || videoPhase !== "scrubbing")} />

      {!FRAME_MODE && <Nav
          dark={navDark}
          user={user}
          onSignOut={() => {
            void api.logout().finally(() => {
              council.reset();
              setUser(null);
              setLocked(true);
            });
          }}
          onWhite={videoPhase === "playing" && videoWhite && !sectionVisible && !videoNight} items={items} onAccount={() => openDrawer("memory")} onStart={goToCouncil} startLabel="Start a Session" />}

      {!FRAME_MODE && (
        <p
          className={`starwell pointer-events-none fixed inset-x-0 bottom-2.5 z-[59] text-center text-[10.5px] tracking-[0.08em] transition-all duration-500 ${
            council.messages.length || council.streaming ? "opacity-0" : "opacity-100"
          } ${navDark ? "text-ink/40" : "text-white/55"}`}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          by STARWELL SI
        </p>
      )}

      {locked && !FRAME_MODE && (
        <AccessGate
          onUnlocked={(name) => {
            setUser(name);
            setLocked(false);
            council.setError(null);
            loadLibrary();
          }}
        />
      )}

      {intro && <Onboarding user={user} onDone={() => setIntro(false)} />}
      {about && (
        <About
          onClose={() => setAbout(false)}
          onReplayIntro={() => {
            setAbout(false);
            setIntro(true);
          }}
        />
      )}

      {drawer && (
        <Drawer
          kind={drawer}
          onClose={() => setDrawer(null)}
          activeId={council.conversationId}
          onSwitch={setDrawer}
          onOpenConversation={(id) => {
            if (phaseRef.current === "idle") start();
            void council.load(id).catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
