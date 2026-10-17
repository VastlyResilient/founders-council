import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BookOpen, Building2, CalendarDays, CircleCheck, Compass, Lightbulb, X } from "lucide-react";

type Profile = {
  name: string;
  knownFor: string;
  founded: string[];
  era: string;
  story: string;
  principles: { title: string; line: string }[];
  lens: string;
  episodes: string[];
};

const FounderContext = createContext<(name: string) => void>(() => undefined);

/** Tappable founder name, as written by the Council: [[Full Name|shown]]. */
export function FounderName({ name, children }: { name: string; children: ReactNode }) {
  const open = useContext(FounderContext);
  return (
    <button
      type="button"
      onClick={() => open(name)}
      className="cursor-pointer font-medium underline decoration-current/50 decoration-[1.5px] underline-offset-[3px] transition-[text-decoration-color] hover:decoration-current"
    >
      {children}
    </button>
  );
}

export function FounderProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <FounderContext.Provider value={setName}>
      {children}
      {name && <FounderSheet name={name} onClose={() => setName(null)} />}
    </FounderContext.Provider>
  );
}

const cache = new Map<string, Profile>();

function FounderSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(cache.get(name) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(name)) return;
    let alive = true;
    fetch(`/api/founders/${encodeURIComponent(name)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        cache.set(name, body);
        if (alive) setProfile(body);
      })
      .catch((e) => alive && setError(e.message || "Couldn't load this founder."));
    return () => {
      alive = false;
    };
  }, [name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const initials = initialsOf(profile?.name ?? name);

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center" data-scroll-region>
      <button aria-label="Close" className="absolute inset-0 bg-[#18161B]/25 backdrop-blur-[3px]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`About ${name}`}
        className="liquid-glass-soft anim-stagger relative m-3 flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-[28px]"
        style={{ animationDuration: "0.45s" }}
      >
        <header className="relative z-[3] flex items-start gap-3 px-5 pb-3 pt-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#3a3840] to-[#18161B] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-medium leading-tight text-[#18161B]">{profile?.name ?? name}</h2>
            <p className="mt-0.5 text-[13.5px] leading-snug text-[#18161B]/60">
              {profile ? profile.knownFor : error ? "" : "Pulling up the record…"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-1 rounded-full p-1.5 text-[#18161B]/55 hover:bg-white/70 hover:text-[#18161B]">
            <X size={18} />
          </button>
        </header>

        <div className="thin-scroll relative z-[3] overflow-y-auto px-5 pb-5" style={{ overscrollBehavior: "contain" }}>
          {error && <p className="text-[13.5px] text-[#C4271D]">{error}</p>}
          {!profile && !error && (
            <div className="space-y-2.5 py-2" aria-hidden>
              {[90, 75, 82, 60].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded-full bg-[#18161B]/[0.07]" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {profile && (
            <div className="space-y-4 text-[14px] leading-relaxed text-[#18161B]/85">
              <dl className="space-y-1.5">
                {profile.founded.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <Building2 size={16} className="mt-[3px] shrink-0 text-[#18161B]/55" />
                    <dt className="shrink-0 font-semibold text-[#18161B]">Founded:</dt>
                    <dd>{profile.founded.join(", ")}</dd>
                  </div>
                )}
                {profile.era && (
                  <div className="flex items-start gap-2.5">
                    <CalendarDays size={16} className="mt-[3px] shrink-0 text-[#18161B]/55" />
                    <dt className="shrink-0 font-semibold text-[#18161B]">Active:</dt>
                    <dd>{profile.era}</dd>
                  </div>
                )}
              </dl>

              <section>
                <h3 className="mb-1 flex items-center gap-2 font-semibold text-[#18161B]">
                  <BookOpen size={16} className="text-[#18161B]/55" /> Their story
                </h3>
                <p>{profile.story}</p>
              </section>

              <section>
                <h3 className="mb-1.5 flex items-center gap-2 font-semibold text-[#18161B]">
                  <Compass size={16} className="text-[#18161B]/55" /> How they worked
                </h3>
                <ul className="space-y-2">
                  {profile.principles.map((p) => (
                    <li key={p.title} className="flex items-start gap-2.5">
                      <CircleCheck size={16} className="mt-[3px] shrink-0 text-[#0A84FF]" />
                      <span>
                        <span className="font-semibold text-[#18161B]">{p.title}.</span> {p.line}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl bg-[#0A84FF]/[0.08] px-3.5 py-3">
                <h3 className="mb-0.5 flex items-center gap-2 font-semibold text-[#0A84FF]">
                  <Lightbulb size={16} /> Use this lens
                </h3>
                <p className="text-[#18161B]/85">{profile.lens}</p>
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** "John D. Rockefeller" -> "JR": first and last name initials. */
export function initialsOf(name: string) {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w) && !/^[A-Z]\.$/.test(w));
  if (!words.length) return "";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}
