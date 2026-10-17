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

const LINES = SAYINGS.flatMap((s) => [s.top.join(" "), s.bottom.join(" ")]);
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

/**
 * A three-word line on a single slot reel. The line is pinned to its edge (left for the top line,
 * right for the bottom one) and the reel only moves vertically, so nothing ever shifts sideways.
 */
export function SlotLine({ words, delay = 0, align = "left" }: { words: readonly string[]; delay?: number; align?: "left" | "right" }) {
  const line = words.join(" ");
  const [shown, setShown] = useState(line);
  const [strip, setStrip] = useState<string[] | null>(null);
  const stripRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (line === shown) return;
    const others = LINES.filter((l) => l !== line && l !== shown);
    const filler = Array.from({ length: SPIN_ITEMS }, () => others[Math.floor(Math.random() * others.length)]);
    setStrip([shown, ...filler, line]);
  }, [line]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!strip || !el) return;
    const reduce = false;
    const distance = (strip.length - 1) * ROW;
    let spin: Animation | null = null;
    const start = window.setTimeout(() => {
      spin = el.animate(
        [
          { transform: "translateY(0)", filter: "blur(0px)" },
          { transform: `translateY(-${distance * 0.2}em)`, filter: "blur(2.5px)", offset: 0.2 },
          { transform: `translateY(-${distance * 0.82}em)`, filter: "blur(1.2px)", offset: 0.62 },
          { transform: `translateY(-${distance}em)`, filter: "blur(0px)" },
        ],
        // a fast spin that slows to a gentle stop, like a jackpot reel
        { duration: reduce ? 1 : 2600, easing: "cubic-bezier(0.18, 0.8, 0.22, 1)", fill: "forwards" },
      );
      spin.onfinish = () => {
        setShown(strip[strip.length - 1]);
        setStrip(null);
        spin?.cancel();
      };
    }, reduce ? 0 : delay);
    return () => {
      clearTimeout(start);
      spin?.cancel();
    };
  }, [strip, delay]);

  const rows = strip ?? [shown];
  return (
    <span className="relative block overflow-hidden whitespace-nowrap" style={{ height: `${ROW}em`, textAlign: align }}>
      <span ref={stripRef} className="absolute inset-x-0 top-0 block">
        {rows.map((w, i) => (
          <span key={i} className="block" style={{ height: `${ROW}em` }}>
            {w}
          </span>
        ))}
      </span>
      {/* holds the line's width so the heading keeps its place */}
      <span className="invisible block" aria-hidden>
        {rows.reduce((a, b) => (b.length > a.length ? b : a), "")}
      </span>
    </span>
  );
}
