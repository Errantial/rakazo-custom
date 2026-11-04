import type { ColorTokens } from "@rakazo/ui-tokens";
import { useMemo } from "react";

export type UserBubble = { background: string; foreground: string };

/** Your bubbles take the bot's color in its own chat. */
export function withUserBubble(
  tokens: ColorTokens,
  userBubble: UserBubble | undefined,
): ColorTokens {
  return userBubble
    ? { ...tokens, chatUser: userBubble.background, chatUserForeground: userBubble.foreground }
    : tokens;
}

/**
 * `withUserBubble` that keeps its result between renders, so a markdown palette handed down
 * keeps its identity. It changes with the base palette (appearance or display mode) or the bubble.
 */
export function useUserBubbleTokens(
  tokens: ColorTokens,
  userBubble: UserBubble | undefined,
): ColorTokens {
  return useMemo(() => withUserBubble(tokens, userBubble), [tokens, userBubble]);
}
