import { BOT_INSTRUCTIONS_MAX_LENGTH, BOT_NAME_MAX_LENGTH } from "@rakazo/contracts";
import { displayName } from "./display-name.js";
import { truncatePlainText } from "./markdown-plain.js";

/** A roleplay-style character card, normalized onto a bot's identity fields. */
export interface BotCardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  greetings: string[];
  exampleMessages: string[];
  systemPrompt: string;
  postHistoryInstructions: string;
}

/** A card composed into the bot identity fields the app already stores. */
export interface BotCardProfile {
  name: string;
  description: string;
  instructions: string;
}

/** A greeting is the bot's opening message, so it stays well inside one readable reply. */
export const BOT_CARD_GREETING_MAX_LENGTH = 2_000;

/** The teammate directory shows this much of the public one-liner. */
const DESCRIPTION_MAX_LENGTH = 280;

/** Per-section budgets keep a long card from crowding out standing instructions. */
const SECTION_LIMITS = {
  canon: 6_000,
  personality: 3_000,
  scenario: 2_500,
  examples: 5_000,
  direction: 1_500,
} as const;

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** V2/V3 cards wrap the payload; V1 cards keep the same fields at the top level. */
function cardRecord(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (record.spec !== "chara_card_v2" && record.spec !== "chara_card_v3") return record;
  const data = record.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}

function parseGreetings(firstMessage: unknown, alternates: unknown): string[] {
  const greetings = [firstMessage, ...(Array.isArray(alternates) ? alternates : [])]
    .map((value) => truncatePlainText(trimmedText(value), BOT_CARD_GREETING_MAX_LENGTH))
    .filter(Boolean);
  // Clamping happens first so two long greetings that only differ past the limit collapse.
  return [...new Set(greetings)];
}

/** Example exchanges are separated by <START>; <END> only delimits their end. */
function parseExamples(value: unknown): string[] {
  const source = trimmedText(value);
  if (!source) return [];
  return source
    .split(/<START>/iu)
    .map((part) => part.replace(/<END>/giu, "").trim())
    .filter(Boolean);
}

function hasContent(card: BotCardData): boolean {
  return Boolean(
    card.description ||
      card.personality ||
      card.scenario ||
      card.greetings.length > 0 ||
      card.exampleMessages.length > 0 ||
      card.systemPrompt ||
      card.postHistoryInstructions,
  );
}

/**
 * Read a character card from untrusted JSON. Unknown version metadata and
 * non-string fields are ignored rather than rejected.
 */
export function parseCharacterCard(raw: unknown): BotCardData | undefined {
  const record = cardRecord(raw);
  if (!record) return undefined;

  const card: BotCardData = {
    name: trimmedText(record.name),
    description: trimmedText(record.description),
    personality: trimmedText(record.personality),
    scenario: trimmedText(record.scenario),
    greetings: parseGreetings(record.first_mes, record.alternate_greetings),
    exampleMessages: parseExamples(record.mes_example),
    systemPrompt: trimmedText(record.system_prompt),
    postHistoryInstructions: trimmedText(record.post_history_instructions),
  };
  return card.name || hasContent(card) ? card : undefined;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Read a character card file into untrusted JSON for `parseCharacterCard`: card JSON itself, or a
 * PNG carrying it base64-encoded in a `ccv3` (preferred) or `chara` text chunk. Anything else
 * reads as `undefined` rather than throwing.
 */
export function readCharacterCardFile(bytes: Uint8Array): unknown {
  const text = PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
    ? pngCardText(bytes)
    : new TextDecoder().decode(bytes);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Card tools write uncompressed `tEXt`; compressed `iTXt` is skipped rather than inflated. */
function pngCardText(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = new Map<string, string>();
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const start = offset + 8;
    const end = start + view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, start));
    if (type === "IEND" || end + 4 > bytes.length) break;
    const chunk =
      type === "tEXt" || type === "iTXt" ? pngText(type, bytes.subarray(start, end)) : undefined;
    if (chunk && (chunk.keyword === "ccv3" || chunk.keyword === "chara")) {
      found.set(chunk.keyword, chunk.value);
    }
    offset = end + 4;
  }
  const encoded = found.get("ccv3") ?? found.get("chara");
  if (encoded === undefined) return undefined;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(encoded.trim()), (c) => c.charCodeAt(0)));
  } catch {
    return encoded;
  }
}

function pngText(
  type: "tEXt" | "iTXt",
  data: Uint8Array,
): { keyword: string; value: string } | undefined {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 0) return undefined;
  const keyword = String.fromCharCode(...data.subarray(0, keywordEnd)).toLowerCase();
  // Card payloads are base64, which reads the same as UTF-8 or Latin-1.
  if (type === "tEXt")
    return { keyword, value: new TextDecoder().decode(data.subarray(keywordEnd + 1)) };
  // iTXt: compression flag and method, then NUL-terminated language tag and translated keyword.
  if (data[keywordEnd + 1] !== 0) return undefined;
  const languageEnd = data.indexOf(0, keywordEnd + 3);
  const translatedEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
  if (translatedEnd < 0) return undefined;
  return { keyword, value: new TextDecoder().decode(data.subarray(translatedEnd + 1)) };
}

/** Replace the card's identity macros; a card with no author names their person "the user". */
export function expandCardMacros(
  text: string,
  names?: { charName?: string; userName?: string },
): string {
  const charName = names?.charName?.trim();
  const userName = names?.userName?.trim();
  return text.replace(/\{\{char\}\}|\{\{user\}\}/giu, (token) =>
    token.toLowerCase() === "{{char}}" ? charName || token : userName || "the user",
  );
}

function firstParagraph(text: string): string {
  for (const paragraph of text.split(/\r?\n\s*\r?\n/u)) {
    const collapsed = paragraph.replace(/\s+/gu, " ").trim();
    if (collapsed) return collapsed;
  }
  return "";
}

function markdownSection(heading: string, content: string, limit: number): string {
  const body = truncatePlainText(content, limit).trim();
  return body ? `## ${heading}\n\n${body}` : "";
}

/**
 * Compose a card into the bot fields the app already stores. `description` is a
 * short public summary; the authored canon lives in `instructions`. Greetings
 * stay on the card because the API layer seeds them as the bot's opening.
 *
 * A card that names nothing keeps the caller's fallback name, which every bot
 * needs for the permissions that key off identity.
 */
export function cardBotProfile(
  card: BotCardData,
  options?: { userName?: string; fallbackName?: string },
): BotCardProfile | undefined {
  const userName = options?.userName?.trim() || undefined;
  const rawName = card.name.replace(/\s+/gu, " ").trim();
  const expandedName = expandCardMacros(rawName, { charName: rawName, userName }).trim();
  // A name that only points at itself, or one creation would store blank, names nothing.
  const cardName = /\{\{char\}\}/iu.test(expandedName)
    ? ""
    : displayName(truncatePlainText(expandedName, BOT_NAME_MAX_LENGTH), "");
  const fallbackName = options?.fallbackName?.trim();
  const name =
    cardName ||
    (hasContent(card) && fallbackName ? truncatePlainText(fallbackName, BOT_NAME_MAX_LENGTH) : "");
  if (!name) return undefined;

  const expand = (text: string) => expandCardMacros(text, { charName: name, userName }).trim();
  const canon = expand(card.description);
  const personality = expand(card.personality);
  const scenario = expand(card.scenario);
  const examples = expand(card.exampleMessages.join("\n\n"));
  const direction = [expand(card.systemPrompt), expand(card.postHistoryInstructions)]
    .filter(Boolean)
    .join("\n\n");

  return {
    name,
    description: truncatePlainText(firstParagraph(canon || personality), DESCRIPTION_MAX_LENGTH),
    instructions: truncatePlainText(
      [
        markdownSection("Canon", canon, SECTION_LIMITS.canon),
        markdownSection("Personality", personality, SECTION_LIMITS.personality),
        markdownSection("Setting", scenario, SECTION_LIMITS.scenario),
        markdownSection("Example exchanges", examples, SECTION_LIMITS.examples),
        markdownSection("Standing direction", direction, SECTION_LIMITS.direction),
      ]
        .filter(Boolean)
        .join("\n\n"),
      BOT_INSTRUCTIONS_MAX_LENGTH,
    ),
  };
}
