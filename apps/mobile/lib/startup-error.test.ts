import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ values: new Map<string, string>(), fail: false }));
const secureStorage = {
  getItem: (key: string) => {
    if (store.fail) throw new Error("locked");
    return store.values.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (store.fail) throw new Error("locked");
    store.values.set(key, value);
  },
};
const application = {
  applicationId: "com.example.app",
  nativeApplicationVersion: "1.0.8",
  nativeBuildVersion: "20",
};

import { DEFAULT_API } from "./server-config";
import {
  clearStartupError,
  forgetSelectedServer,
  markExpoErrorReported,
  readStartupError,
  resetStartupMemo,
  saveStartupError,
  startExpoErrorWindow,
} from "./startup-error";

const server = new URL(DEFAULT_API).origin;

beforeEach(() => {
  resetStartupMemo();
  store.values.clear();
  store.fail = false;
});

describe("persisted startup error", () => {
  it("scrubs private values before writing, bounds storage, and preserves the error type", () => {
    const error = new TypeError("Bearer private-token");
    error.stack = `at /Users/example/project/startup.ts:42\n${"x".repeat(10_000)}`;
    saveStartupError(error, secureStorage, application);
    expect(store.values.get("rakazo.startup-error")).not.toMatch(/private-token|\/Users\/example/);
    expect(store.values.get("rakazo.startup-error")!.length).toBeLessThan(8_192);
    expect(readStartupError(secureStorage)).toMatchObject({
      error: { name: "TypeError", stack: expect.stringContaining("startup.ts:42") },
    });
    clearStartupError(secureStorage);
    expect(readStartupError(secureStorage)).toBeUndefined();
  });

  it("keeps the release that crashed and reads records saved before releases were stored", () => {
    saveStartupError(new Error("crash"), secureStorage, application);
    expect(readStartupError(secureStorage)).toMatchObject({
      release: "com.example.app@1.0.8+20",
      dist: "20",
    });
    store.values.set(
      "rakazo.startup-error",
      JSON.stringify({ server, name: "Error", message: "x" }),
    );
    expect(readStartupError(secureStorage)).toEqual({
      error: expect.objectContaining({ message: "x" }),
      release: undefined,
      dist: undefined,
    });
  });

  it("round-trips escaped error text within the serialized size limit", () => {
    const error = new Error('"\\\n\u0000'.repeat(1_024));
    error.stack = `at startup.ts:42\n${'"\\\n\u0000'.repeat(4_096)}`;
    saveStartupError(error, secureStorage, application);
    expect(store.values.get("rakazo.startup-error")!.length).toBeLessThanOrEqual(8_192);
    expect(readStartupError(secureStorage)?.error.message).toBe(error.message.slice(0, 1_024));
  });

  it("does not replay another server's error even if wiping storage failed", () => {
    store.values.set("rakazo.api_base", "https://first.example.com");
    saveStartupError(new Error("old server"), secureStorage, application);
    store.fail = true;
    clearStartupError(secureStorage);
    store.fail = false;
    store.values.set("rakazo.api_base", "https://second.example.com");
    resetStartupMemo(); // a restart
    expect(readStartupError(secureStorage)).toBeUndefined();
  });

  it("ignores malformed records and unavailable secure storage", () => {
    for (const raw of ["{", "[]", "null", '{"message":42}', "x".repeat(8_193)]) {
      store.values.set("rakazo.startup-error", raw);
      expect(readStartupError(secureStorage)).toBeUndefined();
    }
    store.fail = true;
    expect(() => saveStartupError(new Error("original"), secureStorage, application)).not.toThrow();
    expect(() => clearStartupError(secureStorage)).not.toThrow();
    expect(readStartupError(secureStorage)).toBeUndefined();
  });
});

describe("launch-path storage reads and writes", () => {
  function counted() {
    const reads: string[] = [];
    const writes: string[] = [];
    return {
      reads,
      writes,
      storage: {
        getItem: (key: string) => {
          reads.push(key);
          return secureStorage.getItem(key);
        },
        setItem: (key: string, value: string) => {
          writes.push(key);
          secureStorage.setItem(key, value);
        },
      },
    };
  }

  it("reads the saved server and the error window once per process", () => {
    const { reads, storage } = counted();
    startExpoErrorWindow(storage);
    startExpoErrorWindow(storage, `${server}/`);
    startExpoErrorWindow(storage);
    saveStartupError(new Error("crash"), storage, application);
    expect(reads.filter((key) => key === "rakazo.api_base")).toHaveLength(1);
    expect(reads.filter((key) => key === "rakazo.expo-error-window")).toHaveLength(1);
  });

  it("keeps the window current across its own writes and reads a changed server again", () => {
    const { reads, storage } = counted();
    const window = startExpoErrorWindow(storage);
    markExpoErrorReported(5, storage, server);
    expect(startExpoErrorWindow(storage)).toEqual({ ...window, reportedThrough: 5 });
    expect(JSON.parse(store.values.get("rakazo.expo-error-window") ?? "{}")).toMatchObject({
      reportedThrough: 5,
    });
    store.values.set("rakazo.api_base", "https://second.example.com");
    saveStartupError(new Error("before"), storage, application);
    expect(JSON.parse(store.values.get("rakazo.startup-error") ?? "{}").server).toBe(server);
    forgetSelectedServer(storage);
    saveStartupError(new Error("after"), storage, application);
    expect(JSON.parse(store.values.get("rakazo.startup-error") ?? "{}").server).toBe(
      "https://second.example.com",
    );
    expect(reads.filter((key) => key === "rakazo.expo-error-window")).toHaveLength(1);
  });

  it("does not write when the stored record is already empty", () => {
    for (const stored of [undefined, ""]) {
      resetStartupMemo();
      store.values.clear();
      if (stored !== undefined) store.values.set("rakazo.startup-error", stored);
      const { writes, storage } = counted();
      expect(readStartupError(storage)).toBeUndefined();
      clearStartupError(storage);
      clearStartupError(storage);
      expect(writes).toEqual([]);
    }
  });

  it("clears a saved record once and keeps clearing after a later save", () => {
    const { writes, storage } = counted();
    store.values.set(
      "rakazo.startup-error",
      JSON.stringify({ server, name: "Error", message: "x" }),
    );
    expect(readStartupError(storage)?.error.message).toBe("x");
    clearStartupError(storage);
    clearStartupError(storage);
    expect(writes).toEqual(["rakazo.startup-error"]);
    saveStartupError(new Error("again"), storage, application);
    clearStartupError(storage);
    expect(store.values.get("rakazo.startup-error")).toBe("");
    expect(writes).toHaveLength(3);
  });

  it("still tries again after a failed clear", () => {
    saveStartupError(new Error("crash"), secureStorage, application);
    store.fail = true;
    clearStartupError(secureStorage);
    store.fail = false;
    clearStartupError(secureStorage);
    expect(store.values.get("rakazo.startup-error")).toBe("");
  });
});
