// Matches a fence line: its prefix (indent, quote marks, list marker), marker run and info string.
const FENCE_LINE = /^([ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)*)(`{3,}|~{3,})(.*)$/;
const PLAIN_PREFIX = /^ {0,3}$/;
const MARKER_RUN = /^(?:`+|~+)$/;
const INDENTED = /^(?: {4}|\t)/;
const HTML_BLOCK = /^ {0,3}<[A-Za-z/!?]/;

/**
 * Whether a message holds exactly one code block, from a line scan instead of a Markdown parse.
 * It reads only plain fences: a quoted, deeply nested or indented one, an indented line outside
 * a fence, and a fence next to HTML each return undefined, so the caller asks the parser. When
 * it answers, it matches `markdownCodeBlocks(markdown).length === 1`.
 */
export function singleCodeBlockHint(markdown: string): boolean | undefined {
  let blocks = 0;
  let unsure = false;
  let html = false;
  let open: { char: string; length: number; filled: boolean } | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    if (open) {
      const text = line.trim();
      if (MARKER_RUN.test(text) && text[0] === open.char && text.length >= open.length) {
        // Four spaces of indent keep a fence open in a plain document, but not inside a list.
        if (/^(?: {4}|\t)/.test(line)) unsure = true;
        if (open.filled) blocks += 1;
        open = undefined;
      } else if (text) open.filled = true;
      continue;
    }
    const [, prefix = "", marker = "", info = ""] = FENCE_LINE.exec(line) ?? [];
    // A backtick fence's info string has no backtick: ```code``` is inline code.
    if (marker && !(marker.startsWith("`") && info.includes("`"))) {
      if (!PLAIN_PREFIX.test(prefix)) unsure = true;
      open = { char: marker.charAt(0), length: marker.length, filled: false };
      continue;
    }
    if (INDENTED.test(line) && line.trim()) unsure = true;
    if (HTML_BLOCK.test(line)) html = true;
  }
  if (open?.filled) blocks += 1;
  if (html && (blocks > 0 || open)) unsure = true;
  return unsure ? undefined : blocks === 1;
}
