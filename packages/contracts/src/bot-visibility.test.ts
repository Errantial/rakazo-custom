import { describe, expect, it } from "vitest";
import {
  BOT_PEER_VISIBILITY_DEFAULTS,
  BOT_PEER_VISIBILITY_FIELDS,
  botPeerVisibility,
} from "./bot-visibility.js";

describe("bot peer visibility", () => {
  it("keeps instructions, memory, routines, model and tools to the owner by default", () => {
    expect(botPeerVisibility({})).toEqual(BOT_PEER_VISIBILITY_DEFAULTS);
    expect(botPeerVisibility({})).toMatchObject({
      instructions: "owner",
      memory: "owner",
      routines: "owner",
      model: "owner",
      tools: "owner",
    });
    // The short description is how teammates pick who to ask.
    expect(botPeerVisibility({}).description).toBe("teammates");
  });

  it("fills only the missing or unrecognized fields", () => {
    expect(
      botPeerVisibility({ instructions: "teammates", memory: "everyone", model: "managers" }),
    ).toEqual({
      ...BOT_PEER_VISIBILITY_DEFAULTS,
      instructions: "teammates",
      model: "managers",
    });
  });

  it("ignores anything that is not a stored object", () => {
    for (const stored of [undefined, null, "owner", 3, ["owner"]]) {
      expect(botPeerVisibility(stored)).toEqual(BOT_PEER_VISIBILITY_DEFAULTS);
    }
  });

  it("defaults every field it knows about", () => {
    for (const field of BOT_PEER_VISIBILITY_FIELDS) {
      expect(BOT_PEER_VISIBILITY_DEFAULTS[field]).toMatch(/^(owner|managers|teammates)$/);
    }
  });
});
