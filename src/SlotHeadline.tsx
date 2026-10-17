import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** One founder's way of working, summed up in two lines of three words. */
export const SAYINGS: { top: [string, string, string]; bottom: [string, string, string]; founder: string }[] = [
  { top: ["Obsess", "Over", "Customers"], bottom: ["Not", "Over", "Competitors"], founder: "Jeff Bezos" },
  { top: ["Focus", "Means", "Saying"], bottom: ["No", "To", "Hundreds"], founder: "Steve Jobs" },
  { top: ["Visit", "Every", "Competitor"], bottom: ["Steal", "Their", "Best"], founder: "Sam Walton" },
  { top: ["Count", "Every", "Drop"], bottom: ["Cut", "Every", "Cost"], founder: "John D. Rockefeller" },
  { top: ["Invent", "What", "People"], bottom: ["Will", "Actually", "Buy"], founder: "Thomas Edison" },
  { top: ["Question", "Every", "Requirement"], bottom: ["Then", "Delete", "Parts"], founder: "Elon Musk" },
  { top: ["Build", "It", "Simple"], bottom: ["Price", "It", "Low"], founder: "Henry Ford" },
  { top: ["Small", "Teams", "Build"], bottom: ["Faster", "Than", "Armies"], founder: "Kelly Johnson" },
  { top: ["Fail", "Five", "Thousand"], bottom: ["Times", "Then", "Win"], founder: "James Dyson" },
  { top: ["Put", "Product", "In"], bottom: ["Every", "Customer's", "Hand"], founder: "Estée Lauder" },
  { top: ["Stay", "Inside", "Your"], bottom: ["Circle", "Of", "Competence"], founder: "Warren Buffett" },
  { top: ["Simplicity", "Is", "The"], bottom: ["Keynote", "Of", "Elegance"], founder: "Coco Chanel" },
];

const POOL = Array.from(new Set(SAYINGS.flatMap((s) => [...s.top, ...s.bottom])));
const SPIN_ITEMS = 9;
const ROW = 1.08; // em per reel row

/** Advances to the next saying every `everyMs` while `running`. */
// `?slotms=2000` speeds the rotation up for checking the animation.
const EVERY_MS = Number(new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("slotms")) || 30_000;

export function useSaying(running: boolean, everyMs = EVERY_MS) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % SAYINGS.length), everyMs);
    return () => clearInterval(t);
  }, [running, everyMs]);
  return SAYINGS[index];
}

/** Three words, each on its own reel, that spin and settle one after another like a slot machine. */
export function SlotLine({ words, delay = 0, align = "left" }: { words: readonly string[]; delay?: number; align?: "left" | "right" }) {
  return (
    <span className={`inline-flex flex-wrap gap-x-[0.24em] ${align === "right" ? "justify-end" : ""}`}>
      {words.map((w, i) => (
        <Reel key={i} word={w} delay={delay + i * 280} />
      ))}
    </span>
  );
}

function Reel({ word, delay }: { word: string; delay: number }) {
  const [shown, setShown] = useState(word);
  const [strip, setStrip] = useState<string[] | null>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLSpanElement>(null);
  const fromRef = useRef<HTMLSpanElement>(null);
  const toRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (word === shown) return;
    const filler = Array.from({ length: SPIN_ITEMS }, () => POOL[Math.floor(Math.random() * POOL.length)]);
    setStrip([shown, ...filler, word]);
  }, [word]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = stripRef.current;
    const box = boxRef.current;
    if (!strip || !el || !box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const distance = (strip.length - 1) * ROW;
    const timing: KeyframeAnimationOptions = {
      duration: reduce ? 1 : 2200,
      // quick spin, long slow settle with a tiny overshoot, like a reel catching its stop
      easing: "cubic-bezier(0.2, 0.75, 0.25, 1.03)",
      fill: "forwards",
    };
    const fromW = fromRef.current?.offsetWidth ?? 0;
    const toW = toRef.current?.offsetWidth ?? 0;
    let spin: Animation | null = null;
    let resize: Animation | null = null;
    // each reel waits its turn, then spins; started by a timer because delayed animations can skip painting
    const start = window.setTimeout(() => {
      spin = el.animate(
        [
          { transform: "translateY(0)", filter: "blur(0px)" },
          { transform: `translateY(-${distance * 0.18}em)`, filter: "blur(2.5px)", offset: 0.18 },
          { transform: `translateY(-${distance * 0.8}em)`, filter: "blur(1.5px)", offset: 0.62 },
          { transform: `translateY(-${distance}em)`, filter: "blur(0px)" },
        ],
        timing,
      );
      // the reel's window eases from the old word's width to the new one's, so neighbours glide instead of jumping
      resize = box.animate([{ width: `${fromW}px` }, { width: `${toW}px` }], { ...timing, easing: "cubic-bezier(0.45, 0, 0.2, 1)" });
      spin.onfinish = () => {
        setShown(strip[strip.length - 1]);
        setStrip(null);
        spin?.cancel();
        resize?.cancel();
      };
    }, reduce ? 0 : delay);
    box.style.width = `${fromW}px`;
    return () => {
      clearTimeout(start);
      box.style.width = "";
      spin?.cancel();
      resize?.cancel();
    };
  }, [strip, delay]);

  return (
    <span ref={boxRef} className="relative inline-block overflow-hidden align-top" style={{ height: `${ROW}em` }}>
      {/* sizes the reel to the word it shows; the two hidden copies give the start and end widths */}
      <span className="invisible block whitespace-nowrap">{shown}</span>
      <span ref={fromRef} className="invisible absolute left-0 top-0 whitespace-nowrap">{strip ? strip[0] : shown}</span>
      <span ref={toRef} className="invisible absolute left-0 top-0 whitespace-nowrap">{strip ? strip[strip.length - 1] : shown}</span>
      <span ref={stripRef} className="absolute left-0 top-0 flex flex-col whitespace-nowrap text-left">
        {(strip ?? [shown]).map((w, i) => (
          <span key={i} className="block" style={{ height: `${ROW}em` }}>
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}
