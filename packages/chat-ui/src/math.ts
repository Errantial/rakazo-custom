// A fence line: its prefix (indent, quote marks, list markers), marker run and the rest.
const FENCE_LINE = /^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)*(`{3,}|~{3,})(.*)$/;
const BLANK_LINE = /\n[ \t>]*\n/;

/**
 * Rewrites a message so remark-math reads the math a model writes and nothing else:
 * `\(…\)` becomes `$…$` and `\[…\]` becomes `$$…$$`, and a lone `$` that cannot open inline
 * math by Pandoc's rule (a non-space after the opener, a non-space before the closer and no
 * digit after it) is escaped, so "$5 and $10" stays text. Code blocks and code spans are left as
 * written. Only `$` signs are added or escaped, so fence lines keep their structure.
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!/[$\\]/.test(markdown)) return markdown;
  const out: string[] = [];
  let prose: string[] = [];
  let fence: { char: string; length: number } | undefined;
  const flush = () => {
    if (prose.length) out.push(normalizeProse(prose.join("\n")));
    prose = [];
  };
  for (const line of markdown.split("\n")) {
    const match = FENCE_LINE.exec(line);
    const marker = match?.[1];
    if (fence) {
      out.push(line);
      if (
        marker?.[0] === fence.char &&
        marker.length >= fence.length &&
        !(match?.[2] ?? "").trim()
      ) {
        fence = undefined;
      }
    } else if (marker && !(marker[0] === "`" && match?.[2]?.includes("`"))) {
      flush();
      out.push(line);
      fence = { char: marker[0] ?? "`", length: marker.length };
    } else {
      prose.push(line);
    }
  }
  flush();
  return out.join("\n");
}

/** The index of `token` after `from`, unless a blank line ends the paragraph first. */
function findInParagraph(text: string, token: string, from: number): number {
  const at = text.indexOf(token, from);
  if (at < 0) return -1;
  const blank = text.slice(from, at).search(BLANK_LINE);
  return blank < 0 ? at : -1;
}

/** A closing `$` for an opener at `open`, by Pandoc's rule, or -1. */
function inlineMathEnd(text: string, open: number): number {
  if (/\s/.test(text[open + 1] ?? " ")) return -1;
  for (let at = open + 1; at < text.length; at += 1) {
    const char = text[at];
    if (char === "\\") {
      at += 1;
    } else if (char === "`" || (char === "\n" && /^\n[ \t>]*\n/.test(text.slice(at, at + 256)))) {
      // Math never spans a code span or a paragraph break.
      return -1;
    } else if (char === "$") {
      if (text[at + 1] === "$") return -1;
      if (!/\s/.test(text[at - 1] ?? " ") && !/\d/.test(text[at + 1] ?? "")) return at;
    }
  }
  return -1;
}

function normalizeProse(text: string): string {
  let result = "";
  let at = 0;
  while (at < text.length) {
    const char = text[at] ?? "";
    if (char === "`") {
      // A code span closes on a backtick run of the same length; otherwise the run is text.
      const run = /^`+/.exec(text.slice(at))?.[0] ?? "`";
      const close = new RegExp(`(?<!\`)${run}(?!\`)`, "g");
      close.lastIndex = at + run.length;
      const end = close.exec(text);
      const stop = end ? end.index + run.length : at + run.length;
      result += text.slice(at, stop);
      at = stop;
    } else if (char === "\\") {
      const next = text[at + 1] ?? "";
      const closer = next === "(" ? "\\)" : next === "[" ? "\\]" : "";
      const end = closer ? findInParagraph(text, closer, at + 2) : -1;
      if (end >= 0) {
        const body = text.slice(at + 2, end);
        result += next === "(" ? `$${body.trim()}$` : `$$${body}$$`;
        at = end + 2;
      } else {
        result += char + next;
        at += 2;
      }
    } else if (char === "$") {
      const run = /^\$+/.exec(text.slice(at))?.[0] ?? "$";
      if (run.length > 1) {
        result += run;
        at += run.length;
        continue;
      }
      const end = inlineMathEnd(text, at);
      if (end < 0) {
        result += "\\$";
        at += 1;
      } else {
        result += text.slice(at, end + 1);
        at = end + 1;
      }
    } else {
      result += char;
      at += 1;
    }
  }
  return result;
}

type MathNode = {
  type?: string;
  position?: { start?: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
  children?: MathNode[];
};

/** Draws `$$…$$` written inside a paragraph as display math, as authors mean it. */
export function remarkDisplayDoubleDollar() {
  return (tree: MathNode, file: { value: unknown }) => {
    const source = String(file.value);
    const walk = (node: MathNode) => {
      const offset = node.position?.start?.offset;
      if (node.type === "inlineMath" && offset !== undefined && source.startsWith("$$", offset)) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, className: ["language-math", "math-display"] },
        };
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
