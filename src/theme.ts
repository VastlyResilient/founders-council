import { useEffect, useState } from "react";

/** How long day takes to turn into night (and back), in ms. Everything themed eases over this. */
export const DUSK_MS = 4000;

const EVENT = "fc:theme";

export const isNight = () => document.documentElement.classList.contains("dark");

export function setNight(next: boolean) {
  const root = document.documentElement;
  if (root.classList.contains("dark") === next) return;
  root.classList.add("theme-fade");
  root.classList.toggle("dark", next);
  window.clearTimeout((setNight as { t?: number }).t);
  (setNight as { t?: number }).t = window.setTimeout(() => root.classList.remove("theme-fade"), DUSK_MS);
  try {
    localStorage.setItem("fc:theme", next ? "dark" : "light");
  } catch {
    /* storage unavailable */
  }
  skeleton();
  window.dispatchEvent(new Event(EVENT));
}

/**
 * As the theme turns, letters and panel outlines briefly become a glowing wireframe, then refill
 * in the new colors. Runs as separate animations so it never restarts the page's own entrances.
 */
function skeleton() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const onScreen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  };
  const wire = { color: "transparent", textShadow: "0 0 10px rgba(120, 180, 255, 0.45)" };
  // the outline itself can't be keyframed, so it's switched on for the middle of the effect
  const root = document.documentElement;
  window.setTimeout(() => root.classList.add("skeleton"), 260);
  window.setTimeout(() => root.classList.remove("skeleton"), 880);
  document.querySelectorAll("h1, h2, h3, p, a, button, label, li, blockquote, dt, dd").forEach((el) => {
    if (!onScreen(el) || !el.textContent?.trim()) return;
    el.animate([{ offset: 0.3, ...wire }, { offset: 0.55, ...wire }], { duration: 1300, easing: "ease-in-out" });
  });
  const outline = { outline: "1px solid rgba(150, 195, 255, 0.75)", outlineOffset: "-1px" };
  document.querySelectorAll(".liquid-glass, .liquid-glass-soft, .liquid-glass-dark, .bubble, .qa-card, .quote-card, .session-glass").forEach((el) => {
    if (!onScreen(el)) return;
    el.animate([{ offset: 0.3, ...outline }, { offset: 0.6, ...outline }], { duration: 1600, easing: "ease-in-out" });
  });
}

/** The current theme, kept in sync across every component that asks. */
export function useNight() {
  const [night, set] = useState(isNight);
  useEffect(() => {
    const sync = () => set(isNight());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return night;
}
