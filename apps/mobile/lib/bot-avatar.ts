import type { ParsedBotAvatar } from "@rakazo/contracts";
import { parseBotAvatarValue } from "@rakazo/contracts";
import { contrastRatio, resolvePersonaColorDef, shippedBotAvatarShapePath } from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { botEyeColor } from "@rakazo/ui-tokens";

export type MobileBotAvatarPresentation =
  | Exclude<ParsedBotAvatar, { kind: "shape" }>
  | { kind: "shape"; color: string; shapeIndex: number; shapePath: string; eyeColor: string };

/** Resolve a stored `bots.color` value for native rendering, including shape paths. */
export function mobileBotAvatarPresentation(color: string): MobileBotAvatarPresentation {
  const parsed = parseBotAvatarValue(color);
  if (parsed.kind !== "shape") return parsed;
  return {
    ...parsed,
    shapePath: shippedBotAvatarShapePath(parsed.shapeIndex),
    eyeColor: resolvePersonaColorDef("preview", parsed.color).eyeColor,
  };
}

/** Eye color for a body: the shared dark ink when it reads, else the better of ink and paper. */
export function botEyeInk(body: string, tokens: Pick<ColorTokens, "foreground" | "background">) {
  if (contrastRatio(body, botEyeColor) >= 3.5) return botEyeColor;
  return contrastRatio(body, tokens.foreground) >= contrastRatio(body, tokens.background)
    ? tokens.foreground
    : tokens.background;
}
