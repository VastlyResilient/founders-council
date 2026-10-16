import { Fragment, type ReactNode } from "react";

/** Renders the small markdown subset the Council uses: **bold**, *italic*, and "- " lists. */
export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (!list.length) return;
    out.push(
      <ul key={key} className="my-0.5 space-y-0.5 pl-0">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="select-none opacity-60">•</span>
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  lines.forEach((line, i) => {
    const item = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      return;
    }
    flush(`l${i}`);
    out.push(
      <Fragment key={i}>
        {inline(line)}
        {i < lines.length - 1 && "\n"}
      </Fragment>,
    );
  });
  flush("end");
  return <>{out}</>;
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** One bubble per paragraph, like a run of iMessages. */
export function splitIntoBubbles(text: string) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
