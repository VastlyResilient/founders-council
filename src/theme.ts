import { useEffect, useState } from "react";

/** How long day takes to turn into night (and back), in ms. Everything themed eases over this. */
export const DUSK_MS = 5000;

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
  window.dispatchEvent(new Event(EVENT));
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
