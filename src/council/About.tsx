import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChartScatter,
  ChevronLeft,
  Feather,
  Flame,
  FlaskConical,
  HelpCircle,
  History,
  Lightbulb,
  ListChecks,
  MessageSquareReply,
  Moon,
  PlayCircle,
  Route,
  Scale,
  Target,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { AUTHOR_NOTE, Feature, IOS_EASE, VERSE } from "./Onboarding";

function Group({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <section className="mt-7">
      <h2 className="mb-1.5 px-4 text-[13px] font-normal uppercase tracking-[0.02em] text-[#6e6e73] dark:text-white/50">{title}</h2>
      <div className="overflow-hidden rounded-[14px] bg-white dark:bg-[#1c1c1e]">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-snug text-[#6e6e73] dark:text-white/45">{footer}</p>}
    </section>
  );
}

function Row({ Icon, tint, title, text, first = false }: { Icon: typeof BookOpen; tint: string; title: string; text: string; first?: boolean }) {
  return (
    <div className="flex gap-3 pl-4">
      <span className="mt-3 flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px]" style={{ background: tint }}>
        <Icon size={17} strokeWidth={2.1} className="text-white" />
      </span>
      <div className={`flex-1 py-3 pr-4 ${first ? "" : "border-t border-black/[0.08] dark:border-white/10"}`}>
        <div className="text-[16px] font-semibold text-[#18161B] dark:text-white">{title}</div>
        <div className="mt-0.5 text-[14px] leading-snug text-[#6e6e73] dark:text-white/60">{text}</div>
      </div>
    </div>
  );
}

const MODE_ROWS = [
  { Icon: Scale, tint: "#0A84FF", title: "Counsel", text: "An honest read on your situation and the next move, backed by what founders actually did." },
  { Icon: Flame, tint: "#FF453A", title: "Grill me", text: "Stress-tests your idea. Finds the weakest assumption and the question you've been avoiding." },
  { Icon: HelpCircle, tint: "#5E5CE6", title: "Ask me first", text: "The Council asks the questions that matter most, one at a time, before giving any advice." },
  { Icon: ListChecks, tint: "#30D158", title: "Action plan", text: "Your next 48 hours, this week, and one daily habit that builds the judgment behind it." },
  { Icon: Users, tint: "#FF9F0A", title: "Board meeting", text: "Three founders matched to your decision each weigh in, then vote: go, wait, or no." },
];

const FEATURE_ROWS = [
  { Icon: UserRound, tint: "#8E8E93", title: "Tap a founder's name", text: "Underlined names open a short profile: what they built, how they worked, and how to use their lens." },
  { Icon: MessageSquareReply, tint: "#0A84FF", title: "Reply or expand", text: "Tap any message to reply to that exact point, or expand it into a deeper explanation." },
  { Icon: History, tint: "#64D2FF", title: "Sessions", text: "Every conversation is saved privately to your account. Pick up where you left off on any device." },
  { Icon: Lightbulb, tint: "#FFD60A", title: "Memory", text: "Within a session, the Council remembers your business, numbers, and goals. The info icon shows what it knows." },
  { Icon: Moon, tint: "#5E5CE6", title: "Night theme", text: "The moon in the top corner turns the whole app from day to night." },
];

const TIPS = [
  { Icon: Target, tint: "#FF453A", title: "Be specific", text: "Share real numbers: revenue, prices, customers, team size. The more concrete you are, the sharper the advice." },
  { Icon: Zap, tint: "#FF9F0A", title: "Act within 48 hours", text: "Every plan ends with a next move. Do it, then come back with what happened. Results beat more questions." },
  { Icon: Users, tint: "#30D158", title: "Use the board for big calls", text: "Pricing, hiring, launching, quitting. When the Convene the board chip appears, it's worth a tap." },
  { Icon: Flame, tint: "#0A84FF", title: "Invite the hard truth", text: "Use Grill me before you commit time or money. It's cheaper to be wrong in a conversation." },
];

/** About, presented like an iOS settings page: grouped lists, inset rows, colored icon tiles. */
export function About({ onClose, onReplayIntro }: { onClose: () => void; onReplayIntro: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, 420);
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-black/30 sm:items-center sm:p-6" style={{ opacity: shown ? 1 : 0, transition: `opacity 400ms ${IOS_EASE}` }} data-scroll-region>
      <div
        className="relative flex h-full w-full flex-col bg-[#F2F2F7] dark:bg-black sm:h-[min(820px,94vh)] sm:max-w-[520px] sm:rounded-[28px]"
        style={{ transform: shown ? "translateY(0)" : "translateY(100%)", transition: `transform 550ms ${IOS_EASE}`, fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", Helvetica, sans-serif' }}
        role="dialog"
        aria-label="About Founders Council"
      >
        <header className="flex items-center border-b border-black/[0.08] bg-[#F2F2F7]/90 px-2 py-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-black/80 sm:rounded-t-[28px]">
          <button onClick={close} className="flex items-center text-[17px] text-[#0A84FF]">
            <ChevronLeft size={26} strokeWidth={2.2} /> Back
          </button>
          <span className="flex-1 pr-16 text-center text-[17px] font-semibold text-[#18161B] dark:text-white">About</span>
        </header>

        <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-10" style={{ overscrollBehavior: "contain" }}>
          <div className="pt-6 text-center">
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-[#18161B] dark:text-white">Founders Council</h1>
            <p className="mx-auto mt-2 max-w-[24rem] text-[15px] leading-snug text-[#6e6e73] dark:text-white/60">
              The greats study the greats. Built for StarWell SI founders to learn from the historic evidence of founders who started revolutions in their industries.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#FF9F0A]/15 px-2.5 py-0.5 text-[12px] font-semibold text-[#c26b00]">
              <FlaskConical size={12} strokeWidth={2.4} /> Beta
            </span>
          </div>

          <Group title="What it is" footer="Look up your favorite artist, athlete, or author, and you'll find whose craft they studied and who inspired them. The same works for founders.">
            <div className="p-4 text-[15px] leading-snug text-[#18161B] dark:text-white/90">
              Instead of following misinformation or playing the guessing game, you get advice grounded in what the most profound founders actually did, what happened next, and why.
            </div>
          </Group>

          <Group title="How it works">
            <div className="flex flex-col gap-5 p-4">
              <Feature Icon={BookOpen} title="Biographies of the greats" text="740 episodes of founder biographies, read in full and searchable." />
              <Feature Icon={Route} title="Patterns, not opinions" text="Your question is compared with what they faced, the decisions they made, and the patterns that held up across many of them." />
              <Feature Icon={ChartScatter} title="Outcomes and probabilities" text="You see what worked, what failed, and how often, weighed against your situation. Founders appear only when their story genuinely proves the point." />
            </div>
          </Group>

          <Group title="Modes" footer="Switch modes with the button on the left of the message bar.">
            {MODE_ROWS.map((r, i) => (
              <Row key={r.title} {...r} first={i === 0} />
            ))}
          </Group>

          <Group title="How to get the most from it">
            {TIPS.map((r, i) => (
              <Row key={r.title} {...r} first={i === 0} />
            ))}
          </Group>

          <Group title="Features">
            {FEATURE_ROWS.map((r, i) => (
              <Row key={r.title} {...r} first={i === 0} />
            ))}
          </Group>

          <Group title="A note from the author">
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[13px] text-[#6e6e73] dark:text-white/50">
                <Feather size={14} strokeWidth={2} /> Bobby · StarWell SI
              </div>
              {AUTHOR_NOTE.map((p) => (
                <p key={p.slice(0, 12)} className="mt-2.5 text-[15px] leading-snug text-[#18161B] dark:text-white/90">
                  {p}
                </p>
              ))}
              <blockquote className="mt-3.5 border-l-2 border-[#0A84FF] pl-3 text-[15px] italic leading-snug text-[#18161B] dark:text-white/90">
                “{VERSE.text}”
                <span className="mt-1 block text-[13px] not-italic text-[#6e6e73] dark:text-white/50">{VERSE.ref}</span>
              </blockquote>
            </div>
          </Group>

          <Group title="Beta" footer="More founders, stories, and data will be added to the database over time.">
            <button onClick={onReplayIntro} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[16px] text-[#0A84FF]">
              <PlayCircle size={20} strokeWidth={2} /> Replay the welcome
            </button>
          </Group>
        </div>
      </div>
    </div>
  );
}
