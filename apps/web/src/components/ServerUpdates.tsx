import { Trans } from "@lingui/react/macro";
import { Button, Input } from "@rakazo/ui-web";
import { useEffect, useState } from "react";

export function useServerUpdatesAvailable() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/operator-updates", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => setEnabled(result?.enabled === true))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return enabled;
}

export function ServerUpdateSection() {
  const [token, setToken] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [message, setMessage] = useState<"current" | "failed" | "updated" | null>(null);

  async function act(action: "plan" | "apply") {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/operator-updates/${action}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Update failed");
      const result = await response.json();
      if (!result.ok) throw new Error("Update failed");
      setTarget(action === "plan" && !result.upToDate ? result.targetTag : null);
      if (action === "apply") {
        setMessage("updated");
        setToken("");
      } else if (result.upToDate) setMessage("current");
    } catch {
      setTarget(null);
      setMessage("failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-heading3 font-medium">
        <Trans>Server</Trans>
      </summary>
      <form
        className="mt-3 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void act(target ? "apply" : "plan");
        }}
      >
        <label htmlFor="server-update-token">
          <span className="text-sm">
            <Trans>Update token</Trans>
          </span>
          <Input
            id="server-update-token"
            type="password"
            autoComplete="off"
            value={token}
            disabled={Boolean(busy)}
            required
            onChange={(event) => {
              setToken(event.target.value);
              setTarget(null);
              setMessage(null);
            }}
          />
        </label>
        <Button type="submit" variant="outline" disabled={Boolean(busy) || !token}>
          {target ? <Trans>Update server</Trans> : <Trans>Check for updates</Trans>}
        </Button>
        {target ? <span className="text-sm text-muted-foreground">{target}</span> : null}
        <p role="status" className="w-full text-sm text-muted-foreground">
          {busy === "plan" ? (
            <Trans>Checking…</Trans>
          ) : busy === "apply" ? (
            <Trans>Updating…</Trans>
          ) : message === "current" ? (
            <Trans>Up to date</Trans>
          ) : message === "updated" ? (
            <Trans>Server updated. Reload to continue.</Trans>
          ) : message === "failed" ? (
            <Trans>Could not confirm the update. Reload to check.</Trans>
          ) : null}
        </p>
      </form>
    </details>
  );
}
