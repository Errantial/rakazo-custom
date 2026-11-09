import type { Context } from "hono";
import { Hono } from "hono";
import { throttleKey, windowCounter } from "./window-counter.js";

const MINUTE_MS = 60_000;
const ATTEMPTS_PER_MINUTE = 5;
const FAILURES_BEFORE_LOCKOUT = 5;
const LOCKOUT_MS = 15 * MINUTE_MS;
const MAX_LOCKOUTS = 1_000;

/** The header the Settings form sends the typed key in; `Authorization` belongs to app sessions. */
export const UPDATE_TOKEN_HEADER = "x-update-token";

interface OperatorUpdateDeps {
  updaterUrl: string;
  /** The signed-in account behind the request, or null. */
  session: (request: Request) => Promise<{ userId: string } | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  clientIp: (c: Context) => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
}

/**
 * Settings > Updates relays to the updater's release-only door. Only a signed-in administrator can
 * use it, attempts are rate limited, and the API stores no updater credential: it forwards the key
 * the administrator typed, as-is, and the updater validates it. The door takes no parameters and
 * installs only the latest stable release of the updater's own RAKAZO_IMAGE, so a compromised API
 * can ask for nothing beyond that.
 */
export function operatorUpdateRoutes(deps: OperatorUpdateDeps) {
  const { updaterUrl, fetcher = fetch, now = Date.now } = deps;
  const app = new Hono();
  const attempts = windowCounter(MINUTE_MS, now);
  const rejectedKeys = windowCounter(LOCKOUT_MS, now);
  const lockedUntil = new Map<string, number>();

  const tooMany = (c: Context, seconds: number) =>
    c.json({ error: "Too many attempts. Try again later." }, 429, {
      "retry-after": String(Math.ceil(seconds)),
    });
  const lockout = (keys: string[]) => {
    const at = now();
    for (const [key, until] of lockedUntil) if (until <= at) lockedUntil.delete(key);
    if (lockedUntil.size >= MAX_LOCKOUTS) return;
    for (const key of keys) lockedUntil.set(key, at + LOCKOUT_MS);
  };

  // Shown only to administrators, and only while the updater reports its release door as configured.
  app.get("/api/operator-updates", async (c) => {
    c.header("Cache-Control", "no-store");
    const session = await deps.session(c.req.raw);
    if (!session || !(await deps.isAdmin(session.userId))) return c.json({ enabled: false });
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
    const session = await deps.session(c.req.raw);
    if (!session) return c.json({ error: "Sign in to update the server" }, 401);
    if (!(await deps.isAdmin(session.userId))) return c.json({ error: "Forbidden" }, 403);
    const action = c.req.param("action");
    if (action !== "plan" && action !== "apply")
      return c.json({ error: "Invalid update action" }, 400);

    const keys = [`user:${session.userId}`, throttleKey(deps.clientIp(c))];
    const lockedFor = Math.max(0, ...keys.map((key) => (lockedUntil.get(key) ?? 0) - now()));
    if (lockedFor > 0) return tooMany(c, lockedFor / 1000);
    if (keys.some((key) => attempts(key) > ATTEMPTS_PER_MINUTE)) return tooMany(c, 60);

    const token = c.req.header(UPDATE_TOKEN_HEADER)?.trim() ?? "";
    if (!token) return c.json({ error: "Invalid update token" }, 401);
    try {
      const response = await fetcher(
        `${updaterUrl}/release/${action === "plan" ? "check" : "apply"}`,
        {
          method: action === "plan" ? "GET" : "POST",
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(action === "apply" ? 1_800_000 : 30_000),
          redirect: "error",
        },
      );
      if (response.status === 401) {
        // Repeated wrong keys lock this account and address out for a while.
        if (
          keys.map((key) => rejectedKeys(`reject:${key}`)).some((n) => n >= FAILURES_BEFORE_LOCKOUT)
        )
          lockout(keys);
        return c.json({ error: "Invalid update token" }, 401);
      }
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
