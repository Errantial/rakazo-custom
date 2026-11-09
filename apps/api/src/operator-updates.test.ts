import { describe, expect, it, vi } from "vitest";
import { operatorUpdateRoutes } from "./operator-updates.js";

const url = "http://updater.test:7092";
const headers = { authorization: "Bearer typed-by-the-administrator" };

describe("operator updates", () => {
  it("shows only while the updater reports its release door as configured", async () => {
    for (const [answer, enabled] of [
      [Response.json({ ok: true, releases: true }), true],
      [Response.json({ ok: true, releases: false }), false],
      [Response.json({ ok: true }), false],
      [new Response("down", { status: 503 }), false],
    ] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(answer.clone());
      const app = operatorUpdateRoutes(url, fetcher);
      expect(await (await app.request("/api/operator-updates")).json()).toEqual({ enabled });
      expect(fetcher.mock.calls[0]?.[0]).toBe(`${url}/health`);
    }
    const unreachable = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    const app = operatorUpdateRoutes(url, unreachable);
    expect(await (await app.request("/api/operator-updates")).json()).toEqual({ enabled: false });
  });

  it("refuses a request with no bearer key without calling the updater", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const app = operatorUpdateRoutes(url, fetcher);
    for (const authorization of ["", "Bearer", "Bearer   ", "Basic abc"]) {
      const response = await app.request("/api/operator-updates/apply", {
        method: "POST",
        headers: { authorization, cookie: "session=fake-app-session" },
      });
      expect(response.status, authorization).toBe(401);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards the typed key as-is to the release endpoints and nothing else", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        currentTag: "v1.0.0",
        targetTag: "sha-example",
        upToDate: false,
        running: false,
        ok: true,
        deployDir: "/private/deployment",
      }),
    );
    const app = operatorUpdateRoutes(url, fetcher);
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
      expect(init?.headers).toEqual({ authorization: headers.authorization });
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
    const answer = (status: number) =>
      vi.fn<typeof fetch>().mockResolvedValue(new Response("private diagnostics", { status }));
    for (const [status, expected] of [
      [401, 401],
      [404, 404],
      [400, 502],
      [500, 502],
    ] as const) {
      const response = await operatorUpdateRoutes(url, answer(status)).request(
        "/api/operator-updates/apply",
        { method: "POST", headers },
      );
      expect(response.status, String(status)).toBe(expected);
      expect(await response.text()).not.toContain("private diagnostics");
    }
  });
});
