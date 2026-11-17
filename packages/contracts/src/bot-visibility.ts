import * as z from "zod";

/**
 * Who else may read one part of a bot.
 *
 * - `owner`: nobody. The bot itself and its owner in the app.
 * - `managers`: a run the owner started for a bot allowed to manage the fleet, i.e. the same
 *   audience the bot management tools already need.
 * - `teammates`: any of the owner's other bots in the same space.
 */
export const BOT_PEER_AUDIENCES = ["owner", "managers", "teammates"] as const;
export const BotPeerAudienceSchema = z.enum(BOT_PEER_AUDIENCES);
export type BotPeerAudience = z.infer<typeof BotPeerAudienceSchema>;

/** The parts of a bot another bot can be allowed to read. */
export const BOT_PEER_VISIBILITY_FIELDS = [
  "instructions",
  "description",
  "memory",
  "routines",
  "model",
  "tools",
] as const;
export type BotPeerVisibilityField = (typeof BOT_PEER_VISIBILITY_FIELDS)[number];

/**
 * What every bot allows before its owner changes it. The short description is routing
 * information the teammate directory already gives every bot; everything that describes how a
 * bot works or what it knows stays with its owner until the owner shares it.
 */
export const BOT_PEER_VISIBILITY_DEFAULTS: Readonly<
  Record<BotPeerVisibilityField, BotPeerAudience>
> = {
  instructions: "owner",
  description: "teammates",
  memory: "owner",
  routines: "owner",
  model: "owner",
  tools: "owner",
};

export const BotPeerVisibilitySchema = z.object({
  instructions: BotPeerAudienceSchema,
  description: BotPeerAudienceSchema,
  memory: BotPeerAudienceSchema,
  routines: BotPeerAudienceSchema,
  model: BotPeerAudienceSchema,
  tools: BotPeerAudienceSchema,
});
export type BotPeerVisibility = z.infer<typeof BotPeerVisibilitySchema>;

/**
 * Fill every field a stored row or an older client left out. A value this release does not
 * recognize falls back to that field's default rather than hiding the rest.
 */
export function botPeerVisibility(stored: unknown): BotPeerVisibility {
  const source =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const filled = {} as Record<BotPeerVisibilityField, BotPeerAudience>;
  for (const field of BOT_PEER_VISIBILITY_FIELDS) {
    const parsed = BotPeerAudienceSchema.safeParse(source[field]);
    filled[field] = parsed.success ? parsed.data : BOT_PEER_VISIBILITY_DEFAULTS[field];
  }
  return filled;
}
