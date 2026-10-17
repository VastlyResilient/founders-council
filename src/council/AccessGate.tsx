import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LOGO_PATH } from "./ChatWindow";

export function AccessGate({ onUnlocked }: { onUnlocked: (user: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#08090D]/90 px-6 backdrop-blur-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="anim-stagger w-full max-w-[300px] text-center text-white"
        style={{ animationDuration: "0.6s" }}
      >
        <svg width="30" height="30" viewBox="0 0 256 256" aria-hidden className="mx-auto">
          <path d={LOGO_PATH} fill="#fff" />
        </svg>
        <h1 className="mt-4 text-[17px] font-medium tracking-[0.01em]">Founders Council</h1>
        <p className="mt-1 text-[13px] text-white/80">Sign in with your username and password.</p>

        <div className="mt-9 space-y-6 text-left">
          <TypedField id="account-username" label="Username" value={username} onChange={setUsername} glow autoFocus autoComplete="username" />
          <TypedField
            id="account-password"
            label="Password"
            value={password}
            onChange={setPassword}
            masked={!showPassword}
            autoComplete="current-password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="p-1 text-white/70 transition-colors hover:text-white"
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
              </button>
            }
          />
        </div>

        {error && <p className="mt-4 text-[12.5px] text-[#FF8A80]">{error}</p>}
        <button
          type="submit"
          disabled={!username.trim() || !password || busy}
          className="mt-8 text-[13.5px] font-medium text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/**
 * A plain underlined field whose characters fade in as they're typed. The real input sits on top,
 * transparent, so selection, paste and autofill behave normally.
 */
function TypedField({
  id,
  label,
  value,
  onChange,
  masked = false,
  glow = false,
  autoFocus,
  autoComplete,
  trailing,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  masked?: boolean;
  glow?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(Boolean(autoFocus));
  return (
    <div>
      <label htmlFor={id} className="text-[12px] text-white/80">
        {label}
      </label>
      <div className="mt-1.5 flex items-center border-b border-white/30 transition-colors focus-within:border-white/80">
        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-[16px] text-white"
            style={glow && value ? { textShadow: "0 0 10px rgba(255,255,255,0.45), 0 0 2px rgba(255,255,255,0.35)" } : undefined}
          >
            {[...value].map((ch, i) => (
              <span key={i} className="typed-char">
                {masked ? "•" : ch}
              </span>
            ))}
            {focused && <span className="typed-caret" />}
          </div>
          <input
            id={id}
            type={masked ? "password" : "text"}
            autoComplete={autoComplete}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="relative w-full bg-transparent py-2 text-[16px] text-transparent caret-transparent focus:outline-none"
            style={{ WebkitTextFillColor: "transparent" }}
          />
        </div>
        {trailing}
      </div>
    </div>
  );
}
