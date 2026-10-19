import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChartScatter, FlaskConical, Feather, Route } from "lucide-react";
import { LOGO_PATH } from "./ChatWindow";

/** iOS's own spring-like curve for pushes and sheets. */
export const IOS_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const SEEN_KEY = (user: string | null) => `fc:onboarded:${user ?? "guest"}`;

export function hasSeenOnboarding(user: string | null) {
  try {
    return localStorage.getItem(SEEN_KEY(user)) === "1";
  } catch {
    return true;
  }
}

function markSeen(user: string | null) {
  try {
    localStorage.setItem(SEEN_KEY(user), "1");
  } catch {
    /* storage unavailable */
  }
}

export const AUTHOR_NOTE = [
  "Use discernment. Don't depend on this app alone for your answers. Understand what to implement, and always choose action over long conversations. No one wins with knowledge that isn't applied, so apply it, get feedback, and improve.",
  "Above all, let Godly counsel be your foundation and source. This knowledge is here to serve your work and, most importantly, the people you're building it for.",
];
export const VERSE = {
  text: "Therefore, whenever we have the opportunity, we should do good to everyone, especially to those in the family of faith.",
  ref: "Galatians 6:10",
};

/** Children rise in one after another, like iOS setup screens. */
function Rise({ i, active, children }: { i: number; active: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 600ms ${IOS_EASE} ${active ? 120 + i * 90 : 0}ms, transform 700ms ${IOS_EASE} ${active ? 120 + i * 90 : 0}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function Feature({ Icon, title, text, tint = "#0A84FF", dark = false }: { Icon: typeof BookOpen; title: string; text: string; tint?: string; dark?: boolean }) {
  return (
    <div className="flex gap-3.5">
      <Icon size={30} strokeWidth={1.7} style={{ color: tint }} className="mt-0.5 shrink-0" />
      <div>
        <div className={`text-[15px] font-semibold ${dark ? "text-white" : "text-[#18161B]"}`}>{title}</div>
        <div className={`mt-0.5 text-[13.5px] leading-snug ${dark ? "text-white/70" : "text-[#6e6e73]"}`}>{text}</div>
      </div>
    </div>
  );
}

/**
 * First-run welcome, like setting up a new iPhone: four screens that push sideways with the iOS curve,
 * content rising in as each one lands. Swipe or tap Continue. Shown once per account per device.
 */
export function Onboarding({ user, onDone }: { user: string | null; onDone: () => void }) {
  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const width = useRef(1);
  const PAGES = 4;
  const night = page === 2;

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const finish = () => {
    markSeen(user);
    setLeaving(true);
    window.setTimeout(onDone, 520);
  };
  const next = () => (page < PAGES - 1 ? setPage(page + 1) : finish());

  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientX;
    width.current = (e.currentTarget as HTMLElement).clientWidth || 1;
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    let dx = e.clientX - start.current;
    if ((page === 0 && dx > 0) || (page === PAGES - 1 && dx < 0)) dx *= 0.3; // rubber-band at the ends
    setDrag(dx);
  };
  const onUp = () => {
    if (start.current === null) return;
    const dx = drag;
    start.current = null;
    setDrag(0);
    if (dx < -width.current * 0.18 && page < PAGES - 1) setPage(page + 1);
    else if (dx > width.current * 0.18 && page > 0) setPage(page - 1);
  };

  const button = night ? "bg-white text-[#0E1220]" : "bg-[#0A84FF] text-white";

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 sm:p-6"
      style={{ opacity: shown && !leaving ? 1 : 0, transition: `opacity 450ms ${IOS_EASE}` }}
      data-scroll-region
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-white sm:h-[min(760px,92vh)] sm:max-w-[430px] sm:rounded-[38px]"
        style={{
          transform: shown && !leaving ? "translateY(0) scale(1)" : leaving ? "translateY(-4%) scale(0.97)" : "translateY(6%) scale(0.97)",
          transition: `transform 650ms ${IOS_EASE}`,
          fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, sans-serif',
        }}
        role="dialog"
        aria-label="Welcome to Founders Council"
      >
        {/* night sky behind the author's note, fading in as that page arrives */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/media/hero-portrait-night.webp)", opacity: night ? 1 : 0, transition: `opacity 700ms ${IOS_EASE}` }}
        />

        <div
          className="relative flex flex-1 touch-pan-y"
          style={{ transform: `translateX(calc(${-page * 100}% + ${drag}px))`, transition: drag ? "none" : `transform 600ms ${IOS_EASE}` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* 1. What it is */}
          <section className="flex w-full shrink-0 flex-col items-center justify-center px-8 text-center">
            <Rise i={0} active={page === 0}>
              <svg width="64" height="64" viewBox="0 0 256 256" aria-hidden className="mx-auto" style={{ transform: page === 0 ? "scale(1)" : "scale(0.8)", transition: `transform 900ms ${IOS_EASE}` }}>
                <path d={LOGO_PATH} fill="#18161B" />
              </svg>
            </Rise>
            <Rise i={1} active={page === 0}>
              <h1 className="mt-7 text-[34px] font-bold leading-[1.05] tracking-[-0.025em] text-[#18161B]">The greats study the greats.</h1>
            </Rise>
            <Rise i={2} active={page === 0}>
              <p className="mt-4 text-[16px] leading-snug text-[#6e6e73]">
                Founders Council is built for StarWell SI founders to study the historic evidence of founders who started revolutions in their industries, so you can avoid misinformation and stop playing the guessing game.
              </p>
            </Rise>
            <Rise i={3} active={page === 0}>
              <p className="mt-3 text-[16px] leading-snug text-[#6e6e73]">Look up your favorite artist, athlete, or author, and you'll find whose craft they studied and who inspired them.</p>
            </Rise>
          </section>

          {/* 2. How it works */}
          <section className="flex w-full shrink-0 flex-col justify-center px-8">
            <Rise i={0} active={page === 1}>
              <h1 className="text-[32px] font-bold leading-[1.05] tracking-[-0.025em] text-[#18161B]">How the Council works</h1>
            </Rise>
            <div className="mt-8 flex flex-col gap-6">
              <Rise i={1} active={page === 1}>
                <Feature Icon={BookOpen} title="Biographies of the greats" text="Hundreds of hours of biographies of the most profound founders, read in full." />
              </Rise>
              <Rise i={2} active={page === 1}>
                <Feature Icon={Route} title="Patterns, not opinions" text="Your questions are compared with what they faced, the decisions they made, and the patterns that held up." />
              </Rise>
              <Rise i={3} active={page === 1}>
                <Feature Icon={ChartScatter} title="Outcomes and probabilities" text="You see what worked, what failed, and how often, weighed against your situation." />
              </Rise>
            </div>
          </section>

          {/* 3. A note from the author */}
          <section className="flex w-full shrink-0 flex-col justify-end px-4 pb-4">
            <Rise i={0} active={page === 2}>
              <div className="rounded-[26px] border border-white/25 bg-white/[0.13] p-5 text-white backdrop-blur-xl">
                <div className="flex items-center gap-1.5 text-[13px] text-white/65">
                  <Feather size={14} strokeWidth={2} /> A note from the author
                </div>
                <h1 className="mt-2 text-[26px] font-bold leading-[1.1] tracking-[-0.02em]">Apply it. Then improve it.</h1>
                {AUTHOR_NOTE.map((p) => (
                  <p key={p.slice(0, 12)} className="mt-3 text-[14.5px] leading-snug text-white/85">
                    {p}
                  </p>
                ))}
                <blockquote className="mt-4 border-l-2 border-white/40 pl-3 text-[14.5px] italic leading-snug text-white/90">
                  “{VERSE.text}”
                  <span className="mt-1 block text-[13px] not-italic text-white/60">{VERSE.ref}</span>
                </blockquote>
                <div className="mt-4 text-[15px] font-semibold italic">Bobby · StarWell SI</div>
              </div>
            </Rise>
          </section>

          {/* 4. Beta */}
          <section className="flex w-full shrink-0 flex-col items-center justify-center px-8 text-center">
            <Rise i={0} active={page === 3}>
              <span className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#FF9F0A]/12">
                <FlaskConical size={38} strokeWidth={1.7} className="text-[#FF9F0A]" />
              </span>
            </Rise>
            <Rise i={1} active={page === 3}>
              <h1 className="mt-6 text-[32px] font-bold leading-[1.05] tracking-[-0.025em] text-[#18161B]">This is a beta</h1>
            </Rise>
            <Rise i={2} active={page === 3}>
              <p className="mt-4 text-[16px] leading-snug text-[#6e6e73]">
                Founders Council is in beta. More founders, stories, and data will be added to the database over time, and the Council will keep getting sharper.
              </p>
            </Rise>
            <Rise i={3} active={page === 3}>
              <p className="mt-3 text-[14px] leading-snug text-[#8e8e93]">You can reread all of this anytime under About in the menu.</p>
            </Rise>
          </section>
        </div>

        <div className="relative px-6 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex justify-center gap-2" aria-hidden>
            {Array.from({ length: PAGES }, (_, i) => (
              <span
                key={i}
                className="h-[7px] rounded-full"
                style={{
                  width: i === page ? 20 : 7,
                  background: i === page ? (night ? "#fff" : "#18161B") : night ? "rgba(255,255,255,0.35)" : "#d1d1d6",
                  transition: `width 450ms ${IOS_EASE}, background-color 450ms ${IOS_EASE}`,
                }}
              />
            ))}
          </div>
          <button onClick={next} className={`w-full rounded-[16px] py-3.5 text-[17px] font-semibold transition-[transform,background-color,color] duration-500 active:scale-[0.97] ${button}`}>
            {page === PAGES - 1 ? "Get started" : "Continue"}
          </button>
          {/* kept in place on the last page so the button never jumps */}
          <button
            onClick={finish}
            tabIndex={page < PAGES - 1 ? 0 : -1}
            className={`mt-2 w-full py-1.5 text-[14px] transition-opacity duration-300 ${night ? "text-white/60" : "text-[#8e8e93]"} ${page < PAGES - 1 ? "" : "pointer-events-none opacity-0"}`}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
