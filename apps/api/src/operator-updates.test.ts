import { describe, expect, it, vi } from "vitest";
import { operatorUpdateRoutes } from "./operator-updates.js";

const url = "http://updater.test:7092";
const headers = { "x-update-token": "typed-by-the-administrator" };
const result = {
  currentTag: "v1.0.0",
  targetTag: "sha-example",
  upToDate: false,
  running: false,
  ok: true,
  deployDir: "/private/deployment",
};

function setup(
  options: {
    session?: { userId: string } | null;
    admin?: boolean;
    fetcher?: typeof fetch;
    ip?: string;
  } = {},
) {
  const clock = { at: 1_000_000 };
  const fetcher =
    options.fetcher ?? vi.fn<typeof fetch>().mockImplementation(async () => Response.json(result));
  const session = options.session === undefined ? { userId: "admin-1" } : options.session;
  const app = operatorUpdateRoutes({
    updaterUrl: url,
    session: async () => session,
    isAdmin: async () => options.admin ?? true,
    clientIp: () => options.ip ?? "203.0.113.7",
    fetcher,
    now: () => clock.at,
  });
  const post = (action: string, extra: Record<string, string> = headers) =>
    app.request(`/api/operator-updates/${action}`, { method: "POST", headers: extra });
  return { app, post, fetcher: fetcher as ReturnType<typeof vi.fn<typeof fetch>>, clock };
}

describe("operator updates", () => {
  it("shows only to an administrator while the updater reports its release door as configured", async () => {
    for (const [answer, enabled] of [
      [Response.json({ ok: true, releases: true }), true],
      [Response.json({ ok: true, releases: false }), false],
      [Response.json({ ok: true }), false],
      [new Response("down", { status: 503 }), false],
    ] as const) {
      const { app, fetcher } = setup({
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(answer.clone()),
      });
      expect(await (await app.request("/api/operator-updates")).json()).toEqual({ enabled });
      expect(fetcher.mock.calls[0]?.[0]).toBe(`${url}/health`);
    }
    const unreachable = setup({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED")),
    });
    expect(await (await unreachable.app.request("/api/operator-updates")).json()).toEqual({
      enabled: false,
    });
    for (const options of [{ session: null }, { admin: false }]) {
      const { app, fetcher } = setup(options);
      expect(await (await app.request("/api/operator-updates")).json()).toEqual({ enabled: false });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("answers 401 without a session and 403 to a signed-in non-administrator", async () => {
    const signedOut = setup({ session: null });
    expect((await signedOut.post("apply")).status).toBe(401);
    const member = setup({ admin: false });
    expect((await member.post("apply")).status).toBe(403);
    expect((await member.post("plan")).status).toBe(403);
    expect(signedOut.fetcher).not.toHaveBeenCalled();
    expect(member.fetcher).not.toHaveBeenCalled();
  });

  it("refuses a request with no typed key without calling the updater", async () => {
    const { post, fetcher } = setup();
    const unusable: Array<Record<string, string>> = [
      {},
      { "x-update-token": "   " },
      { authorization: "Bearer app-session" },
    ];
    for (const extra of unusable) {
      expect((await post("apply", extra)).status).toBe(401);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards the typed key as a bearer to the release endpoints and nothing else", async () => {
    const { app, fetcher } = setup();
    const body = JSON.stringify({ repoUrl: "https://untrusted.invalid/repo", branch: "main" });
    const plan = await app.request("/api/operator-updates/plan?repo=x", {
      method: "POST",
      headers,
      body,
    });
    const apply = await app.request("/api/operator-updates/apply", {
      method: "POST",
      headers,
      body,
    });
    expect(fetcher.mock.calls.map(([target]) => target)).toEqual([
      `${url}/release/check`,
      `${url}/release/apply`,
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toEqual({ authorization: "Bearer typed-by-the-administrator" });
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe("error");
    }
    expect(await plan.json()).toEqual({
      currentTag: "v1.0.0",
      targetTag: "sha-example",
      upToDate: false,
      running: false,
      ok: true,
    });
    expect(apply.status).toBe(200);
  });

  it("passes the updater's rejection of the key through and hides everything else", async () => {
    for (const [status, expected] of [
      [401, 401],
      [404, 404],
      [400, 502],
      [500, 502],
    ] as const) {
      const { post } = setup({
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("private diagnostics", { status })),
      });
      const response = await post("apply");
      expect(response.status, String(status)).toBe(expected);
      expect(await response.text()).not.toContain("private diagnostics");
    }
  });

  it("answers 429 after a few attempts a minute, then allows more once the minute passes", async () => {
    const { post, fetcher, clock } = setup();
    for (let attempt = 0; attempt < 5; attempt++) expect((await post("plan")).status).toBe(200);
    const limited = await post("plan");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(fetcher).toHaveBeenCalledTimes(5);
    clock.at += 61_000;
    expect((await post("plan")).status).toBe(200);
  });

  it("limits an address across accounts", async () => {
    const answer = () => Response.json(result);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => answer());
    const clock = { at: 1_000_000 };
    let userId = "admin-1";
    const app = operatorUpdateRoutes({
      updaterUrl: url,
      session: async () => ({ userId }),
      isAdmin: async () => true,
      clientIp: () => "203.0.113.7",
      fetcher,
      now: () => clock.at,
    });
    const status = async () =>
      (await app.request("/api/operator-updates/plan", { method: "POST", headers })).status;
    for (let attempt = 0; attempt < 5; attempt++) expect(await status()).toBe(200);
    userId = "admin-2";
    expect(await status()).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("locks the account and address out after repeated wrong keys from the updater", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("no", { status: 401 }));
    const { post, clock } = setup({ fetcher });
    // The per-minute limit would also stop these, so spread them out to see the lockout alone.
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await post("apply")).status).toBe(401);
      clock.at += 61_000;
    }
    const locked = await post("apply");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(60);
    expect(fetcher).toHaveBeenCalledTimes(5);
    clock.at += 15 * 60_000 + 1;
    expect((await post("apply")).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});
