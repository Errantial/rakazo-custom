import type { BotPeerAudience, BotPeerVisibility, BotPeerVisibilityField } from "@rakazo/contracts";

/**
 * Who is asking for another bot's data:
 *
 * - `manager`: a run the owner started for a bot that may manage the fleet. This is the same
 *   audience the bot management tools need, so enabling one bot to manage others is the owner's
 *   approval for this audience.
 * - `teammate`: any other bot the owner runs, including one managing the fleet when it is not in
 *   a run the owner started.
 */
export type PeerViewer = "manager" | "teammate";

/** Whether a field the target shares with `audience` is readable by `viewer`. */
export function peerVisibilityAllows(audience: BotPeerAudience, viewer: PeerViewer): boolean {
  if (audience === "teammates") return true;
  if (audience === "managers") return viewer === "manager";
  return false;
}

/** Whether `viewer` may read one part of a bot whose visibility is `visibility`. */
export function peerVisibilityAllowsField(
  visibility: BotPeerVisibility,
  field: BotPeerVisibilityField,
  viewer: PeerViewer,
): boolean {
  return peerVisibilityAllows(visibility[field], viewer);
}
