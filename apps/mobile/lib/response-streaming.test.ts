import { RESPONSE_STREAMING_STORAGE_KEY } from "@rakazo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

vi.mock("react-native", () => ({
  Appearance: { getColorScheme: () => "dark", addChangeListener: () => ({ remove() {} }) },
  Platform: { OS: "android" },
}));
vi.mock("./ai-consent", () => ({ promptAiConsent: vi.fn() }));
vi.mock("./live-notifications", () => ({ resumeLiveNotifications: vi.fn() }));
vi.mock("./network-cache", () => ({ clearNetworkCache: vi.fn() }));
vi.mock("./device-profile", () => ({ isEinkDevice: () => false }));

describe("mobile response streaming preference", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("defaults to streaming off", async () => {
    const { getCachedResponseStreamingEnabled, setResponseStreamingPreference } = await import(
      "./response-streaming"
    );
    expect(getCachedResponseStreamingEnabled()).toBe(false);
    await setResponseStreamingPreference("on");
    expect(getCachedResponseStreamingEnabled()).toBe(true);
  });

  it("loads a saved on preference and notifies subscribers", async () => {
    const { loadResponseStreamingPreference, subscribeResponseStreaming } = await import(
      "./response-streaming"
    );
    store.set(RESPONSE_STREAMING_STORAGE_KEY, "on");
    const listener = vi.fn();
    subscribeResponseStreaming(listener);

    await expect(loadResponseStreamingPreference()).resolves.toBe("on");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies subscribers before SecureStore finishes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { setItemAsync } = await import("expo-secure-store");
    vi.mocked(setItemAsync).mockImplementation(async () => {
      await gate;
    });
    const {
      getCachedResponseStreamingEnabled,
      setResponseStreamingPreference,
      subscribeResponseStreaming,
    } = await import("./response-streaming");
    const listener = vi.fn();
    subscribeResponseStreaming(listener);

    const pending = setResponseStreamingPreference("on");
    expect(getCachedResponseStreamingEnabled()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    release();
    await pending;
  });

  it("normalizes an empty stored value to off", async () => {
    store.set(RESPONSE_STREAMING_STORAGE_KEY, "");
    const { loadResponseStreamingPreference } = await import("./response-streaming");
    await expect(loadResponseStreamingPreference()).resolves.toBe("off");
  });
});

describe("response streaming in e-ink", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it("is off while e-ink is active, keeps the stored choice, and follows the mode", async () => {
    const streaming = await import("./response-streaming");
    const display = await import("./display-mode");
    await display.setDisplayMode("standard");
    await streaming.setResponseStreamingPreference("on");
    expect(streaming.getCachedResponseStreamingEnabled()).toBe(true);

    const listener = vi.fn();
    streaming.subscribeResponseStreaming(listener);
    await display.setDisplayMode("eink");
    expect(listener).toHaveBeenCalled();
    expect(streaming.getCachedResponseStreamingEnabled()).toBe(false);
    expect(streaming.getCachedResponseStreamingPreference()).toBe("on");

    await display.setDisplayMode("standard");
    expect(streaming.getCachedResponseStreamingEnabled()).toBe(true);
  });

  it("delivers the final full reply when e-ink is switched on mid-stream", async () => {
    const { applyMobileThreadEvent } = await import("./api");
    const { withLiveStreamingProgress } = await import("@rakazo/core");
    const streaming = await import("./response-streaming");
    const display = await import("./display-mode");
    await display.setDisplayMode("standard");
    await streaming.setResponseStreamingPreference("on");
    const visible = (snap: Parameters<typeof withLiveStreamingProgress>[0]) =>
      withLiveStreamingProgress(snap, streaming.getCachedResponseStreamingEnabled());

    let snap: ReturnType<typeof applyMobileThreadEvent> = {
      threadId: "t1",
      cursor: 0,
      messages: [],
    } as never;
    snap = applyMobileThreadEvent(snap, {
      type: "thread.progress",
      seq: 1,
      runId: "run-1",
      payload: { text: "Lis", streaming: true },
    });
    expect(visible(snap)?.messages).toHaveLength(1);

    await display.setDisplayMode("eink");
    snap = applyMobileThreadEvent(snap, {
      type: "thread.progress",
      seq: 2,
      runId: "run-1",
      payload: { delta: "bon", streaming: true },
    });
    expect(visible(snap)?.messages).toEqual([]);

    snap = applyMobileThreadEvent(snap, {
      type: "thread.message.created",
      seq: 3,
      runId: "run-1",
      payload: { messageId: "m-final", role: "bot", blocks: [{ kind: "text", text: "Lisbon" }] },
    });
    expect(visible(snap)?.messages).toEqual([
      expect.objectContaining({ id: "m-final", blocks: [{ kind: "text", text: "Lisbon" }] }),
    ]);
  });
});
