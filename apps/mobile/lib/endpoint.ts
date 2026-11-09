import { isPrivateNetworkHost } from "@rakazo/contracts";
import { cancelResponseBody, readBoundedJsonResponse, withAbort } from "@rakazo/core";
import { t } from "./i18n";
import { DEFAULT_API, LOCAL_API } from "./server-config";

export const API_PROBE_TIMEOUT_MS = 8_000;
export const MAX_API_PROBE_RESPONSE_BYTES = 64 * 1024;

export type EndpointResult = { ok: true; url: string } | { ok: false; error: string };
type HealthResponse = { json?: { ok?: boolean }; error?: { message?: string } };

export function defaultApiBase() {
  return originOnly(DEFAULT_API) ?? LOCAL_API;
}

export function normalizeApiBase(input: string): EndpointResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: t("Enter a server URL") };
  const parsed = parseServerAddress(trimmed);
  if (!parsed) return { ok: false, error: t("That doesn’t look like a URL") };
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: t("Use an http or https URL") };
  }
  if (!parsed.hostname) return { ok: false, error: t("That URL is missing a host") };
  if (parsed.protocol === "http:" && !isPrivateNetworkHost(parsed.hostname)) {
    return { ok: false, error: "Public servers need https://" };
  }
  const url = `${parsed.protocol}//${parsed.host}`;
  return { ok: true, url };
}

/**
 * Accepts what someone types on a phone. A bare address is usually this network's
 * server, which speaks http, so private hosts get http and public hosts get https.
 * The desktop setup infers the same way.
 */
function parseServerAddress(trimmed: string): URL | null {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return new URL(trimmed);
    const candidate = new URL(`http://${trimmed}`);
    return isPrivateNetworkHost(candidate.hostname) ? candidate : new URL(`https://${trimmed}`);
  } catch {
    return null;
  }
}

export function displayApiHost(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}

export function usesCustomApiBase(url: string, fallback = defaultApiBase()) {
  return url !== fallback;
}

export function apiBaseWarning(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" && !isPrivateNetworkHost(parsed.hostname)) {
      return t("Public servers need https://. HTTP only works on your local network.");
    }
  } catch {
    return null;
  }
  return null;
}

export async function probeApiBase(
  input: string,
  fetchImpl: typeof fetch = fetch,
  headers: Record<string, string> = {},
): Promise<EndpointResult> {
  const parsed = normalizeApiBase(input);
  if (!parsed.ok) return parsed;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_PROBE_TIMEOUT_MS);
  try {
    const res = await withAbort(
      fetchImpl(`${parsed.url}/rpc/health`, {
        method: "POST",
        ...(Object.keys(headers).length ? { redirect: "error" as const } : {}),
        headers: { ...headers, "content-type": "application/json", origin: "rakazo://" },
        body: JSON.stringify({ json: {} }),
        signal: controller.signal,
      }),
      controller.signal,
      "Request timed out",
    );
    if (!res.ok) {
      cancelResponseBody(res);
      return { ok: false, error: t("That URL did not look like a Rakazo server") };
    }
    let body: HealthResponse;
    try {
      body = await readBoundedJsonResponse<HealthResponse>(
        res,
        MAX_API_PROBE_RESPONSE_BYTES,
        controller.signal,
      );
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      body = {};
    }
    if (body.error || body.json?.ok !== true) {
      return { ok: false, error: t("That URL did not look like a Rakazo server") };
    }
    return parsed;
  } catch {
    return { ok: false, error: t("Could not reach that server") };
  } finally {
    clearTimeout(timer);
  }
}

function originOnly(value: string) {
  const parsed = normalizeApiBase(value);
  return parsed.ok ? parsed.url : null;
}
