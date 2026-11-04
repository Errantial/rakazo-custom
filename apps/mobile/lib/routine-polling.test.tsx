// @vitest-environment jsdom

import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  app: { state: "active", listeners: new Set<(state: string) => void>() },
}));

vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return mocks.app.state;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.app.listeners.add(listener);
      return { remove: () => mocks.app.listeners.delete(listener) };
    },
  },
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => undefined | (() => void)) => {
    useEffect(callback, [callback]);
  },
}));
vi.mock("./api", () => ({
  rpc: mocks.rpc,
  currentApiBase: () => "https://api.example.test",
  selectedSpaceId: () => "space-a",
  captureApiRequestContext: async () => ({ apiBase: "https://api.example.test", headers: {} }),
}));
vi.mock("./session", () => ({ currentSessionGeneration: () => 0 }));
vi.mock("./i18n", () => ({ t: (text: string) => text }));

import { ROUTINE_RUNS_POLL_MS, useRoutineRuns } from "./routine-runs";
import { ROUTINES_POLL_MS, useBotRoutines } from "./routine-store";

function Routines() {
  useBotRoutines("bot-1");
  return null;
}
function Runs() {
  useRoutineRuns("routine-1");
  return null;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.app.state = "active";
  mocks.rpc
    .mockReset()
    .mockImplementation(async (proc: string) =>
      proc === "routines/history" ? { runs: [], nextCursor: null } : [],
    );
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const reads = (proc: string) => mocks.rpc.mock.calls.filter(([name]) => name === proc).length;
const setApp = async (state: string) => {
  mocks.app.state = state;
  await act(async () => {
    for (const listener of mocks.app.listeners) listener(state);
  });
};
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

describe.each([
  ["routines list", "routines/list", ROUTINES_POLL_MS, Routines],
  ["routine history", "routines/history", ROUTINE_RUNS_POLL_MS, Runs],
])("%s polling", (_name, proc, interval, Screen) => {
  it("polls while the app is visible, pauses in the background, and reads at once on return", async () => {
    await act(async () => root.render(<Screen />));
    await advance(0);
    expect(reads(proc)).toBe(1);
    await advance(interval);
    expect(reads(proc)).toBe(2);

    await setApp("background");
    await advance(interval * 4);
    expect(reads(proc)).toBe(2);

    await setApp("active");
    await advance(0);
    expect(reads(proc)).toBe(3);
    await advance(interval);
    expect(reads(proc)).toBe(4);
  });
});
