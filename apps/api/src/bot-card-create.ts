import type { CreateBotInput } from "@rakazo/contracts";
import type { BotCardProfile } from "@rakazo/core/bot-cards";
import { cardBotProfile, expandCardMacros, parseCharacterCard } from "@rakazo/core/bot-cards";

export interface BotCardSeed {
  profile: BotCardProfile;
  greeting?: string;
}

/**
 * Turn an untrusted character card into a bot profile and its opening line. A card with nothing
 * usable maps to nothing, so creation can go on as a plain bot. The mapper is total over any
 * parsed JSON value, so no card can fail a creation request.
 */
export function botCardCreation(
  raw: unknown,
  options: { userName: string; fallbackName?: string },
): BotCardSeed | undefined {
  const card = parseCharacterCard(raw);
  if (!card) return undefined;
  const profile = cardBotProfile(card, options);
  if (!profile) return undefined;
  const [firstGreeting] = card.greetings;
  const greeting = firstGreeting
    ? expandCardMacros(firstGreeting, { charName: profile.name, userName: options.userName }).trim()
    : "";
  return { profile, greeting: greeting || undefined };
}

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
      : botCardCreation(characterCard, { userName, fallbackName: typed.name });
  if (!seed) return { fields: typed, greeting: undefined, skipIntro: false };
  return {
    fields: {
      ...typed,
      name: seed.profile.name || typed.name,
      description: seed.profile.description || typed.description,
      instructions: seed.profile.instructions || typed.instructions,
    },
    greeting: seed.greeting,
    skipIntro: Boolean(seed.profile.instructions || seed.greeting),
  };
}
