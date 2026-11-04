import { describe, expect, it, vi } from "vitest";
import {
  createKeyedPromiseCache,
  createLimiter,
  fitImageSize,
  isInlineImageMimeType,
} from "./inline-image.js";

describe("fitImageSize", () => {
  it("scales a large image down to the box while keeping its ratio", () => {
    expect(fitImageSize({ width: 2000, height: 1000 }, 300, 300)).toEqual({
      width: 300,
      height: 150,
    });
    expect(fitImageSize({ width: 1000, height: 2000 }, 300, 300)).toEqual({
      width: 150,
      height: 300,
    });
  });

  it("never scales a small image up", () => {
    expect(fitImageSize({ width: 120, height: 80 }, 300, 300)).toEqual({ width: 120, height: 80 });
  });

  it("survives a missing or zero size", () => {
    expect(fitImageSize({ width: 0, height: 0 }, 300, 300)).toEqual({ width: 1, height: 1 });
  });
});

describe("isInlineImageMimeType", () => {
  it("accepts raster images and rejects SVG, files and unknowns", () => {
    expect(isInlineImageMimeType("image/png")).toBe(true);
    expect(isInlineImageMimeType("IMAGE/JPEG; charset=binary")).toBe(true);
    expect(isInlineImageMimeType("image/svg+xml")).toBe(false);
    expect(isInlineImageMimeType("application/pdf")).toBe(false);
    expect(isInlineImageMimeType(undefined)).toBe(false);
  });
});

describe("createKeyedPromiseCache", () => {
  it("loads each key once while the promise is shared", async () => {
    let calls = 0;
    const cache = createKeyedPromiseCache(async (key: string) => {
      calls += 1;
      return `uri:${key}`;
    });
    const [a, b] = await Promise.all([cache.get("one"), cache.get("one")]);
    expect(a).toBe("uri:one");
    expect(b).toBe("uri:one");
    expect(calls).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it("forgets a failed load so the next call retries", async () => {
    let calls = 0;
    const cache = createKeyedPromiseCache(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return "uri";
    });
    await expect(cache.get("one")).rejects.toThrow("offline");
    expect(cache.size()).toBe(0);
    await expect(cache.get("one")).resolves.toBe("uri");
    expect(calls).toBe(2);
  });

  it("only forgets a key for the promise that observed the stale value", async () => {
    let calls = 0;
    const cache = createKeyedPromiseCache(async () => {
      calls += 1;
      return `uri-${calls}`;
    });
    const stale = cache.get("one");
    await stale;
    cache.forget("one", stale);
    const fresh = cache.get("one");
    cache.forget("one", stale); // a second caller that also saw the stale file must not evict the retry
    expect(cache.get("one")).toBe(fresh);
    await expect(fresh).resolves.toBe("uri-2");
    expect(calls).toBe(2);
  });
  it("a late failure after clearing cannot evict a replacement load", async () => {
    let fail!: (reason: Error) => void;
    let calls = 0;
    const cache = createKeyedPromiseCache(() => {
      calls += 1;
      return calls === 1
        ? new Promise<string>((_resolve, reject) => {
            fail = reject;
          })
        : Promise.resolve("fresh");
    });
    const old = cache.get("one");
    cache.clear();
    const fresh = cache.get("one");
    fail(new Error("stale"));
    await expect(old).rejects.toThrow("stale");
    expect(cache.get("one")).toBe(fresh);
    await expect(fresh).resolves.toBe("fresh");
    expect(calls).toBe(2);
  });
});

describe("createLimiter", () => {
  const deferred = () => {
    let settle!: { resolve: () => void; reject: (error: Error) => void };
    const promise = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    return { promise, ...settle };
  };

  it("runs two tasks at once and starts the third when one finishes", async () => {
    const limit = createLimiter(2);
    const tasks = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const results = tasks.map((task, index) =>
      limit(() => {
        started.push(index);
        return task.promise;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    tasks[0]?.resolve();
    await results[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    tasks[1]?.resolve();
    tasks[2]?.resolve();
    await Promise.all(results);
  });

  it("frees the slot after a rejection", async () => {
    const limit = createLimiter(1);
    const first = deferred();
    const failed = limit(() => first.promise);
    const second = vi.fn(async () => "done");
    const next = limit(second);
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();

    first.reject(new Error("timeout"));
    await expect(failed).rejects.toThrow("timeout");
    await expect(next).resolves.toBe("done");
    await expect(limit(async () => "again")).resolves.toBe("again");
  });

  it("frees the slot when a task throws synchronously", async () => {
    const limit = createLimiter(1);
    await expect(
      limit(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });
});
