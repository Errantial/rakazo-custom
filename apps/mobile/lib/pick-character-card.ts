import type { CharacterCardBot } from "@rakazo/core/bot-cards";
import { CHARACTER_CARD_FILE_MAX_BYTES, characterCardBot } from "@rakazo/core/bot-cards";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

/** A picked file the inbox creates from, or one that held no usable card. */
export type CharacterCardChoice = { kind: "none" } | (CharacterCardBot & { kind: "bot" });

/**
 * Lets the person pick a character card file (card JSON, or a PNG carrying one) and reads it.
 * Returns null when the picker was cancelled.
 */
export async function pickCharacterCard(fallbackName: string): Promise<CharacterCardChoice | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "image/png"],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return { kind: "none" };
  const file = new File(asset.uri);
  const size = file.info().size;
  if (typeof size === "number" && size > CHARACTER_CARD_FILE_MAX_BYTES) return { kind: "none" };
  const bot = characterCardBot(new Uint8Array(await file.arrayBuffer()), { fallbackName });
  return bot ? { kind: "bot", ...bot } : { kind: "none" };
}
