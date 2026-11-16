import { describe, expect, it } from "vitest";
import {
  type PeerViewer,
  peerVisibilityAllows,
  peerVisibilityAllowsField,
} from "./peer-visibility.js";

const viewers: PeerViewer[] = ["manager", "teammate"];

describe("peer visibility", () => {
  it("never lets another bot read owner-only data", () => {
    for (const viewer of viewers) expect(peerVisibilityAllows("owner", viewer)).toBe(false);
  });

  it("lets only a fleet-manager run read what a bot shares with managers", () => {
    expect(peerVisibilityAllows("managers", "manager")).toBe(true);
    expect(peerVisibilityAllows("managers", "teammate")).toBe(false);
  });

  it("lets every teammate read what a bot shares with teammates", () => {
    for (const viewer of viewers) expect(peerVisibilityAllows("teammates", viewer)).toBe(true);
  });

  it("reads one field of a visibility object", () => {
    const visibility = {
      instructions: "owner",
      description: "teammates",
      memory: "managers",
      routines: "owner",
      model: "owner",
      tools: "owner",
    } as const;
    expect(peerVisibilityAllowsField(visibility, "description", "teammate")).toBe(true);
    expect(peerVisibilityAllowsField(visibility, "memory", "teammate")).toBe(false);
    expect(peerVisibilityAllowsField(visibility, "memory", "manager")).toBe(true);
    expect(peerVisibilityAllowsField(visibility, "instructions", "manager")).toBe(false);
  });
});
