import { Fragment, type ReactNode } from "react";
import { FounderName } from "./Founder";

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

const FOUNDER = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/;

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    const founder = part.match(FOUNDER);
    if (founder) return <FounderName key={i} name={founder[1].trim()}>{(founder[2] ?? founder[1]).trim()}</FounderName>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold">{inline(part.slice(2, -2))}</strong>;
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export const QUOTE_CARD = /^\{\{quote\|([^|}]+)\|([\s\S]+?)\}\}$/;
/** {{board|Full Name|message}}: one founder speaking in a board meeting. */
export const BOARD_MSG = /^\{\{board\|([^|}]+)\|([\s\S]+?)\}\}$/;
/** {{verdict|decision|condition|Name=go;Name=wait}}: the board's verdict card. */
export const VERDICT = /^\{\{verdict\|([^|}]+)\|([^|}]+)\|([^}]*)\}\}$/;

export function parseVotes(raw: string) {
  return raw
    .split(";")
    .map((v) => v.split("=").map((x) => x.trim()))
    .filter(([name, vote]) => name && vote)
    .map(([name, vote]) => ({ name, vote: vote.toLowerCase() as "go" | "wait" | "no" }));
}

/** One bubble per paragraph, like a run of iMessages; quote cards always get their own item. */
export function splitIntoBubbles(text: string) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\s*\n/)
    .flatMap((p) => p.split(/(\{\{(?:quote|board|verdict)\|[^}]+\}\})/))
    .map((p) => p.trim())
    .filter((p) => p && !/^>>\s/.test(p)); // suggested replies are chips, never bubbles
}

/** Founder markup as plain text, for previews and titles. */
export function plainText(text: string) {
  return text
    .replace(/\{\{board\|([^|}]+)\|([^}]+)\}\}/g, (_m, name, words) => `${name.trim()}: ${words.trim()}`)
    .replace(/\{\{verdict\|([^|}]+)\|([^|}]+)\|[^}]*\}\}/g, (_m, d, c) => `Verdict: ${d.trim()}. ${c.trim()}`)
    .replace(/\{\{quote\|([^|}]+)\|([^}]+)\}\}/g, (_m, name, words) => `${name.trim()}: "${words.trim()}"`).replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_m, full, shown) => (shown ?? full).trim());
}
