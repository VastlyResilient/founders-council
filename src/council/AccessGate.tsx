import { useState } from "react";
import { ArrowUp, Lock, User } from "lucide-react";
import { LOGO_PATH } from "./ChatWindow";

export function AccessGate({ onUnlocked }: { onUnlocked: (user: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) return onUnlocked(body?.user ?? username);
      setError(body?.error ?? "That username or password isn't right.");
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
        <h1 className="mt-4 text-[19px] font-medium text-ink">Founders Council</h1>
        <p className="mt-1 text-[13.5px] text-ink/60">Sign in to your account.</p>
        <div className="liquid-glass mt-5 flex items-center gap-2 rounded-full py-1.5 pl-4 pr-4">
          <User size={15} className="shrink-0 text-ink/45" />
          <label htmlFor="account-username" className="sr-only">
            Username
          </label>
          <input
            id="account-username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </div>
        <div className="liquid-glass mt-2.5 flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5">
          <Lock size={15} className="shrink-0 text-ink/45" />
          <label htmlFor="account-password" className="sr-only">
            Password
          </label>
          <input
            id="account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-ink placeholder:text-ink/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!username.trim() || !password || busy}
            aria-label="Sign in"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A84FF] text-white disabled:bg-ink/15"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        </div>
        {error && <p className="mt-3 text-[12.5px] text-[#C4271D]">{error}</p>}
      </form>
    </div>
  );
}
