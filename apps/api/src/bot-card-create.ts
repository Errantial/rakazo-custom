import type { CreateBotInput } from "@rakazo/contracts";
import { botCardSeed, mergeCardFields } from "@rakazo/core/bot-cards";

/**
 * The fields to create a bot with. A usable card supplies the name, and its description and
 * instructions replace the typed ones only where the card actually authored them, so a name-only
 * card never wipes what the person wrote. The intro run is skipped only when the card wrote the
 * bot's instructions or opening line; a card that only names the bot still gets the intro.
 */
export function botCreateFields(
  input: CreateBotInput,
  userName: string,
): {
  fields: Omit<CreateBotInput, "characterCard">;
  greeting: string | undefined;
  skipIntro: boolean;
} {
  const { characterCard, ...typed } = input;
  const seed =
    characterCard === undefined
      ? undefined
      : botCardSeed(characterCard, { userName, fallbackName: typed.name });
  const merged = mergeCardFields(typed, seed);
  return {
    fields: {
      ...typed,
      name: merged.name,
      description: merged.description,
      instructions: merged.instructions,
    },
    greeting: seed?.greeting,
    skipIntro: merged.skipIntro,
  };
}
