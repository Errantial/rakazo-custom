import { describe, expect, it } from "vitest";
import { inboxPollIntervalMs } from "./poll-cadence";

describe("inboxPollIntervalMs", () => {
  it("polls every 15 seconds in standard mode", () => {
    expect(inboxPollIntervalMs("standard")).toBe(15_000);
  });

  it("polls every 30 seconds in e-ink mode", () => {
    expect(inboxPollIntervalMs("eink")).toBe(30_000);
  });
});
