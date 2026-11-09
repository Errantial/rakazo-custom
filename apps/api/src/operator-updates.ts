import { hasValidBearerToken, releaseRepository } from "@rakazo/core";
import { Hono } from "hono";

/** Deployment credentials authorize host changes independently of ordinary app accounts. */
export function operatorUpdateRoutes(
  config: { token: string; image: string } | undefined,
  fetcher: typeof fetch = fetch,
) {
  const app = new Hono();
  const repository = config && releaseRepository(config.image);
  const enabled = Boolean(repository && config && config.token.length >= 32);
  app.get("/api/operator-updates", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ enabled });
  });
  app.post("/api/operator-updates/:action", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!enabled || !config || !repository) return c.json({ error: "Unavailable" }, 404);
    if (!hasValidBearerToken(c.req.header("authorization"), config.token))
      return c.json({ error: "Invalid update token" }, 401);
    const action = c.req.param("action");
    if (action !== "plan" && action !== "apply")
      return c.json({ error: "Invalid update action" }, 400);
    try {
      const releaseResponse = await fetcher(
        `https://api.github.com/repos/${repository}/releases/latest`,
        {
          headers: { accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        },
      );
      if (!releaseResponse.ok) return c.json({ error: "No release available" }, 502);
      const release = await releaseResponse.json();
      if (
        release.draft !== false ||
        release.prerelease !== false ||
        typeof release.tag_name !== "string" ||
        !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
      ) {
        return c.json({ error: "No stable release available" }, 502);
      }
      const response = await fetcher(`http://updater:7092/${action}`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          repoUrl: `https://github.com/${repository}`,
          branch: release.tag_name,
        }),
        signal: AbortSignal.timeout(action === "apply" ? 1_800_000 : 30_000),
        redirect: "error",
      });
      if (!response.ok) return c.json({ error: "Update could not be completed" }, 502);
      const result = await response.json();
      // Never expose the sidecar's deployment paths, command output, or raw errors.
      return c.json({
        currentTag: result.currentTag ?? result.toTag ?? null,
        targetTag: release.tag_name,
        upToDate: result.upToDate === true,
        running: result.running === true,
        ok: action === "apply" ? result.ok === true : true,
      });
    } catch {
      return c.json({ error: "Could not confirm the update. Reload to check." }, 502);
    }
  });
  return app;
}
