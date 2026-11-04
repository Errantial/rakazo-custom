import { UI_DISPLAY_STORAGE_KEY } from "@rakazo/ui-tokens";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_STORAGE_KEY, SPACE_STORAGE_KEY } from "./server-config";

const values = new Map<string, string>();
const reads: string[] = [];
const secure = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-secure-store", () => secure);

beforeEach(() => {
  vi.resetModules();
  values.clear();
  reads.length = 0;
  secure.getItemAsync.mockImplementation(async (key: string) => {
    reads.push(key);
    return values.get(key) ?? null;
  });
  secure.setItemAsync.mockImplementation(async (key: string, value: string) => {
    values.set(key, value);
  });
  secure.deleteItemAsync.mockImplementation(async (key: string) => {
    values.delete(key);
  });
});

describe("secure value prefetch", () => {
  it("hands out each prefetched read once, then reads normally", async () => {
    const { prefetchSecureValues, readSecureValue } = await import("./prefetch");
    values.set(API_BASE_STORAGE_KEY, "https://one.example.test");
    prefetchSecureValues(secure);
    expect(reads).toContain(API_BASE_STORAGE_KEY);
    const before = reads.length;

    await expect(readSecureValue(secure, API_BASE_STORAGE_KEY)).resolves.toBe(
      "https://one.example.test",
    );
    expect(reads).toHaveLength(before);

    values.set(API_BASE_STORAGE_KEY, "https://two.example.test");
    await expect(readSecureValue(secure, API_BASE_STORAGE_KEY)).resolves.toBe(
      "https://two.example.test",
    );
    expect(reads).toHaveLength(before + 1);
  });

  it("reads keys that were not prefetched", async () => {
    const { prefetchSecureValues, readSecureValue } = await import("./prefetch");
    prefetchSecureValues(secure);
    values.set("rakazo.other", "x");
    await expect(readSecureValue(secure, "rakazo.other")).resolves.toBe("x");
  });

  it("never returns a prefetched value after a write that came before the read", async () => {
    const { forgetPrefetched, prefetchSecureValues, readSecureValue } = await import("./prefetch");
    values.set(SPACE_STORAGE_KEY, "space-old");
    prefetchSecureValues(secure);
    forgetPrefetched(SPACE_STORAGE_KEY);
    values.set(SPACE_STORAGE_KEY, "space-new");
    await expect(readSecureValue(secure, SPACE_STORAGE_KEY)).resolves.toBe("space-new");
  });

  it("passes a failed read to its consumer and leaves an unused one quiet", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    secure.getItemAsync.mockRejectedValue(new Error("locked"));
    const { prefetchSecureValues, readSecureValue } = await import("./prefetch");
    prefetchSecureValues(secure);
    await expect(readSecureValue(secure, API_BASE_STORAGE_KEY)).rejects.toThrow("locked");
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("does not throw when the store fails to start a read", async () => {
    const { prefetchSecureValues } = await import("./prefetch");
    expect(() =>
      prefetchSecureValues({
        getItemAsync: () => {
          throw new Error("native module missing");
        },
      }),
    ).not.toThrow();
  });
});

describe("loaders and writers use the prefetch", () => {
  it("loadDisplayMode consumes the prefetched read once", async () => {
    vi.doMock("react-native", () => ({ Appearance: {} }));
    const { prefetchSecureValues } = await import("./prefetch");
    const { loadDisplayMode } = await import("./display-mode");
    values.set(UI_DISPLAY_STORAGE_KEY, "eink");
    prefetchSecureValues(secure);
    const before = reads.filter((key) => key === UI_DISPLAY_STORAGE_KEY).length;
    expect(await loadDisplayMode()).toBe("eink");
    expect(reads.filter((key) => key === UI_DISPLAY_STORAGE_KEY)).toHaveLength(before);
    await loadDisplayMode();
    expect(reads.filter((key) => key === UI_DISPLAY_STORAGE_KEY)).toHaveLength(before + 1);
  });

  it("a display mode saved before the load wins over the prefetched one", async () => {
    const { prefetchSecureValues } = await import("./prefetch");
    const { loadDisplayMode, setDisplayMode } = await import("./display-mode");
    values.set(UI_DISPLAY_STORAGE_KEY, "eink");
    prefetchSecureValues(secure);
    await setDisplayMode("standard");
    expect(await loadDisplayMode()).toBe("standard");
  });
});
