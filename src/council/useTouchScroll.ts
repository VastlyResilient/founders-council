import { useEffect, type RefObject } from "react";

/**
 * Scrolls an element directly from touch on phones, with momentum after the finger lifts.
 * iPhone Safari won't natively scroll the chat inside the glass panel (it hands the swipe to the
 * page instead), so the chat moves itself. Taps still work: nothing is cancelled until the finger moves.
 */
export function useTouchScroll(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: coarse)").matches) return;

    let lastY = 0;
    let lastT = 0;
    let velocity = 0; // px per ms, positive = content moves up
    let moved = false;
    let raf = 0;

    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(raf);
      lastY = e.touches[0].clientY;
      lastT = performance.now();
      velocity = 0;
      moved = false;
    };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const now = performance.now();
      const dy = lastY - y;
      if (!moved && Math.abs(dy) < 3) return;
      if (!moved) {
        // dragging the conversation puts the keyboard away, like iMessage
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) active.blur();
      }
      moved = true;
      if (e.cancelable) e.preventDefault();
      el.scrollTop += dy;
      const dt = Math.max(now - lastT, 1);
      velocity = 0.8 * (dy / dt) + 0.2 * velocity;
      lastY = y;
      lastT = now;
      el.dispatchEvent(new Event("scroll"));
    };
    const onEnd = () => {
      if (!moved) return;
      // glide to a stop, like a native list
      let v = velocity;
      let prev = performance.now();
      const glide = (now: number) => {
        const dt = now - prev;
        prev = now;
        v *= Math.pow(0.995, dt);
        if (Math.abs(v) < 0.02) return;
        const before = el.scrollTop;
        el.scrollTop += v * dt;
        if (el.scrollTop === before) return; // hit the top or bottom
        raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [ref]);
}
