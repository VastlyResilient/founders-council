import { useEffect, useState } from "react";
import { Info, Loader2, X } from "lucide-react";
import { api, type Answer } from "./api";

export type QaState = { messageId: string; questions: string[]; index: number; answers: Answer[] };

type Explanation = { simple: string; examples: string[] };

/**
 * "Ask me first": the chat dims and one question at a time sits in its own soft spotlight,
 * just above the message box. The info button unfolds a plain-words version of the question.
 */
export function QuestionFocus({ qa, conversationId, onSkip }: { qa: QaState; conversationId: string | null; onSkip: () => void }) {
  const question = qa.questions[qa.index];
  const [open, setOpen] = useState(false);
  const [cache, setCache] = useState<Record<string, Explanation | "loading" | "error">>({});
  const explanation = cache[question];

  // A new question starts folded.
  useEffect(() => setOpen(false), [question]);

  const load = () => {
    if (!conversationId || (explanation && explanation !== "error")) return;
    setCache((c) => ({ ...c, [question]: "loading" }));
    api
      .explain(conversationId, question)
      .then((e) => setCache((c) => ({ ...c, [question]: e })))
      .catch(() => setCache((c) => ({ ...c, [question]: "error" })));
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col justify-end">
      <div className="qa-veil absolute inset-0" aria-hidden />
      <div className="pointer-events-auto relative mx-auto mb-4 w-[calc(100%-24px)] max-w-[560px] sm:mb-5">
        <div key={qa.index} className="qa-card relative overflow-hidden rounded-[22px]" role="group" aria-label={`Question ${qa.index + 1} of ${qa.questions.length}`}>
          <div className="relative px-4 pb-3.5 pt-3 sm:px-5">
            <span className="qa-sheen" aria-hidden />
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1" aria-hidden>
                {qa.questions.map((_, i) => (
                  <span
                    key={i}
                    className={`h-[5px] rounded-full transition-all duration-500 ${i === qa.index ? "w-4 bg-[#0A84FF]" : i < qa.index ? "w-[5px] bg-[#0A84FF]/45" : "w-[5px] bg-ink/15"}`}
                  />
                ))}
              </span>
              <span className="text-[11px] font-medium text-ink/40">
                {qa.index + 1} of {qa.questions.length}
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <p className="flex-1 text-[16px] font-medium leading-snug text-ink">{question}</p>
              <button
                onClick={() => {
                  setOpen((o) => !o);
                  load();
                }}
                aria-expanded={open}
                aria-label="Explain this question in simpler terms"
                className={`mt-[1px] shrink-0 rounded-full p-1 transition-colors ${open ? "bg-[#0A84FF]/10 text-[#0A84FF]" : "text-ink/40 hover:text-[#0A84FF]"}`}
              >
                <Info size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink/40">
              <span>Type your answer below and press Enter</span>
              <button onClick={onSkip} className="rounded-full px-1.5 py-0.5 font-medium hover:text-ink/70">
                Skip
              </button>
            </div>
          </div>

          <Unfold open={open}>
            <div className="relative bg-[#2B2930]/95 px-4 pb-4 pt-3.5 text-[13.5px] leading-relaxed text-white/80 sm:px-5">
              <button
                onClick={() => setOpen(false)}
                aria-label="Close the explanation"
                className="absolute right-2.5 top-2.5 rounded-full p-1 text-white/45 transition-colors hover:bg-paper/10 hover:text-white"
              >
                <X size={15} />
              </button>
              {explanation === "loading" || !explanation ? (
                <p className="flex items-center gap-2 pr-7 text-white/55">
                  <Loader2 size={14} className="animate-spin" /> Putting this in terms of your business…
                </p>
              ) : explanation === "error" ? (
                <p className="pr-7 text-white/60">
                  Couldn't simplify this one.{" "}
                  <button onClick={load} className="font-medium text-white underline underline-offset-2">
                    Try again
                  </button>
                </p>
              ) : (
                <>
                  <p className="pr-7 text-white/90">{explanation.simple}</p>
                  {explanation.examples.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <p className="text-[11.5px] font-medium text-white/45">For example</p>
                      {explanation.examples.map((e) => (
                        <p key={e} className="border-l-2 border-white/15 pl-2.5 text-white/75">
                          {e}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Unfold>
        </div>
      </div>
    </div>
  );
}

/** Height-animated reveal: unfolds downward gently, folds back up a little quicker. */
function Unfold({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: open ? "grid-template-rows 520ms cubic-bezier(0.22,1,0.36,1)" : "grid-template-rows 340ms cubic-bezier(0.55,0,0.75,0.2)",
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(-10px)",
            transition: open ? "opacity 420ms ease 120ms, transform 520ms cubic-bezier(0.22,1,0.36,1)" : "opacity 200ms ease, transform 340ms ease-in",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
