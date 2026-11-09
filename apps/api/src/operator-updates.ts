import { Hono } from "hono";

/**
 * Settings > Updates relays to the updater's release-only door. The API stores no updater
 * credential: it forwards the key the administrator typed, as-is, and the updater validates it.
 * The door takes no parameters and installs only the latest stable release of the updater's own
 * RAKAZO_IMAGE, so a compromised API can ask for nothing beyond that.
 */
export function operatorUpdateRoutes(updaterUrl: string, fetcher: typeof fetch = fetch) {
  const app = new Hono();
  // Shown only while the updater reports its release door as configured.
  app.get("/api/operator-updates", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      const response = await fetcher(`${updaterUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
        redirect: "error",
      });
      const health = response.ok ? await response.json() : null;
      return c.json({ enabled: health?.releases === true });
    } catch {
      return c.json({ enabled: false });
    }
  });
  app.post("/api/operator-updates/:action", async (c) => {
    c.header("Cache-Control", "no-store");
    const action = c.req.param("action");
    if (action !== "plan" && action !== "apply")
      return c.json({ error: "Invalid update action" }, 400);
    const authorization = c.req.header("authorization") ?? "";
    if (!/^bearer\s+\S/i.test(authorization)) return c.json({ error: "Invalid update token" }, 401);
    try {
      const response = await fetcher(
        `${updaterUrl}/release/${action === "plan" ? "check" : "apply"}`,
        {
          method: action === "plan" ? "GET" : "POST",
          headers: { authorization },
          signal: AbortSignal.timeout(action === "apply" ? 1_800_000 : 30_000),
          redirect: "error",
        },
      );
      if (response.status === 401) return c.json({ error: "Invalid update token" }, 401);
      if (response.status === 404) return c.json({ error: "Unavailable" }, 404);
      if (!response.ok) return c.json({ error: "Update could not be completed" }, 502);
      const result = await response.json();
      // Never expose the sidecar's deployment paths, command output, or raw errors.
      return c.json({
        currentTag: result.currentTag ?? null,
        targetTag: result.targetTag ?? null,
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
