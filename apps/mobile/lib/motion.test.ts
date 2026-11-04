import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "standard", reduced: false }));

vi.mock("./display-mode", () => ({
  getCachedDisplayMode: () => state.mode,
  useDisplayMode: () => state.mode,
}));
vi.mock("react-native-reanimated", () => ({
  ReduceMotion: { System: "system", Always: "always", Never: "never" },
  useReducedMotion: () => state.reduced,
}));

import {
  lifeMotionPreference,
  motionPreference,
  useMotionAllowed,
  useMotionPreference,
} from "./motion";

beforeEach(() => {
  state.mode = "standard";
  state.reduced = false;
});

describe("motion decisions", () => {
  it("allows motion in standard mode unless the OS reduces it", () => {
    expect(useMotionAllowed()).toBe(true);
    state.reduced = true;
    expect(useMotionAllowed()).toBe(false);
  });

  it("never allows motion in e-ink", () => {
    state.mode = "eink";
    expect(useMotionAllowed()).toBe(false);
  });

  it("follows the system setting in standard mode and always reduces in e-ink", () => {
    expect(motionPreference()).toBe("system");
    expect(useMotionPreference()).toBe("system");
    state.mode = "eink";
    expect(motionPreference()).toBe("always");
    expect(useMotionPreference()).toBe("always");
  });

  it("keeps avatar life running under the OS setting but stops it in e-ink", () => {
    expect(lifeMotionPreference()).toBe("never");
    state.mode = "eink";
    expect(lifeMotionPreference()).toBe("always");
  });
});
