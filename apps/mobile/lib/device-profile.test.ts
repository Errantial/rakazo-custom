import { beforeEach, describe, expect, it, vi } from "vitest";

import { isEinkDevice } from "./device-profile";

const platform = vi.hoisted(() => ({
  OS: "android" as "android" | "ios",
  constants: {} as { Manufacturer?: string; Brand?: string; Model?: string },
}));

vi.mock("react-native", () => ({ Platform: platform }));

beforeEach(() => {
  platform.OS = "android";
  platform.constants = {};
});

describe("isEinkDevice", () => {
  it("detects the Mudita Kompakt by manufacturer", () => {
    expect(isEinkDevice({ Manufacturer: "Mudita", Model: "Kompakt" })).toBe(true);
  });

  it("detects the Mudita Kompakt by brand", () => {
    expect(isEinkDevice({ Brand: "Mudita", Model: "Kompakt" })).toBe(true);
  });

  it("rejects ordinary Android phones", () => {
    expect(isEinkDevice({ Manufacturer: "Google", Model: "Pixel 9" })).toBe(false);
  });

  it("rejects missing constants", () => {
    expect(isEinkDevice({})).toBe(false);
  });

  it("reads Platform.constants when no constants are passed", () => {
    platform.constants = { Manufacturer: "Mudita", Brand: "Mudita", Model: "Kompakt" };
    expect(isEinkDevice()).toBe(true);
  });

  it("returns false on iOS even if the constants match", () => {
    platform.OS = "ios";
    expect(isEinkDevice({ Manufacturer: "Mudita", Brand: "Mudita", Model: "Kompakt" })).toBe(false);
  });
});
