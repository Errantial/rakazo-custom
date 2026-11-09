import { describe, expect, it, vi } from "vitest";
import { operatorUpdateRoutes } from "./operator-updates.js";

const config = {
  token: "fake-operator-token-000000000000000000",
  image: "ghcr.io/example/custom/app",
};
const headers = { authorization: `Bearer ${config.token}` };
const release = { tag_name: "v1.1.0", draft: false, prerelease: false };

describe("operator updates", () => {
  it("stays disabled without a deployment token or supported image namespace", async () => {
    for (const value of [
      undefined,
      { ...config, token: "short" },
      { ...config, image: "local/app" },
    ]) {
      const app = operatorUpdateRoutes(value);
      expect(await (await app.request("/api/operator-updates")).json()).toEqual({ enabled: false });
      expect(
        (await app.request("/api/operator-updates/apply", { method: "POST", headers })).status,
      ).toBe(404);
    }
  });
  it("never gives ordinary app sessions deployment authority", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const app = operatorUpdateRoutes(config, fetcher);
    for (const authorization of ["", "Bearer wrong", "Basic abc"]) {
      const response = await app.request("/api/operator-updates/apply", {
        method: "POST",
        headers: { authorization, cookie: "session=fake-app-session" },
      });
      expect(response.status).toBe(401);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("pins both sidecar and release source and omits host diagnostics", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(release))
      .mockResolvedValueOnce(
        Response.json({
          currentTag: "v1.0.0",
          targetTag: "sha-example",
          upToDate: false,
          deployDir: "/private/deployment",
          checkout: { remoteUrl: "private" },
        }),
      );
    const app = operatorUpdateRoutes(config, fetcher);
    const response = await app.request("/api/operator-updates/plan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        repoUrl: "https://untrusted.invalid/repo",
        url: "http://untrusted.invalid",
      }),
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://updater:7092/plan",
      expect.objectContaining({
        redirect: "error",
        body: JSON.stringify({ repoUrl: "https://github.com/example/custom", branch: "v1.1.0" }),
      }),
    );
    expect(await response.json()).toEqual({
      currentTag: "v1.0.0",
      targetTag: "v1.1.0",
      upToDate: false,
      running: false,
      ok: true,
    });
  });
  it("does not return raw sidecar errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(release))
      .mockResolvedValue(new Response("private diagnostics", { status: 500 }));
    const response = await operatorUpdateRoutes(config, fetcher).request(
      "/api/operator-updates/apply",
      { method: "POST", headers },
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private diagnostics");
  });
  it.each([
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, tag_name: "main" },
  ])("refuses an unpublished or unstable release: %j", async (candidate) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(candidate));
    const response = await operatorUpdateRoutes(config, fetcher).request(
      "/api/operator-updates/apply",
      { method: "POST", headers },
    );
    expect(response.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ accept: "application/vnd.github+json" });
  });
});
