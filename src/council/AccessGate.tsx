import { useState } from "react";
import { ArrowUp, Lock } from "lucide-react";
import { LOGO_PATH } from "./ChatWindow";

export function AccessGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) return onUnlocked();
      setError((await res.json().catch(() => null))?.error ?? "That access code isn't right.");
    } catch {
      setError("The Council's server can't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0A0B11]/55 px-4 backdrop-blur-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="liquid-glass-soft anim-stagger w-full max-w-sm rounded-[28px] p-6 text-center"
        style={{ animationDuration: "0.6s" }}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#3a3840] to-[#18161B]">
          <svg width="22" height="22" viewBox="0 0 256 256" aria-hidden>
            <path d={LOGO_PATH} fill="#fff" />
          </svg>
        </span>
        <h1 className="mt-4 text-[19px] font-medium text-[#18161B]">Founders Council</h1>
        <p className="mt-1 text-[13.5px] text-[#18161B]/60">Enter your access code to open the Council.</p>
        <div className="liquid-glass mt-5 flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5">
          <Lock size={15} className="shrink-0 text-[#18161B]/45" />
          <label htmlFor="access-code" className="sr-only">
            Access code
          </label>
          <input
            id="access-code"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-[#18161B] placeholder:text-[#18161B]/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!code.trim() || busy}
            aria-label="Unlock"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A84FF] text-white disabled:bg-[#18161B]/15"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        </div>
        {error && <p className="mt-3 text-[12.5px] text-[#C4271D]">{error}</p>}
      </form>
    </div>
  );
}
