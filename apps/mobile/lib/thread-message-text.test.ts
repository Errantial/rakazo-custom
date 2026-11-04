import { describe, expect, it, vi } from "vitest";

const display = vi.hoisted(() => ({ eink: false }));
vi.mock("./display-mode", () => ({
  mobileBotColor: (color: string) => (display.eink ? "#000000" : color),
}));
vi.mock("./i18n", () => ({ t: (text: string) => text }));

import { speakerColorFor } from "./thread-message-text";

const bots = [{ id: "bot-1", color: "#F5A03C" }] as never;

describe("speakerColorFor", () => {
  it("keeps the bot identity color in standard mode", () => {
    display.eink = false;
    expect(speakerColorFor(bots, undefined, "bot-1")).toBe("#F5A03C");
  });

  it("uses ink in e-ink", () => {
    display.eink = true;
    expect(speakerColorFor(bots, undefined, "bot-1")).toBe("#000000");
  });
});
