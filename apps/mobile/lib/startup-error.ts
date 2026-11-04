import { sanitizedError } from "@rakazo/logging/monitoring";
import type * as Application from "expo-application";
import { API_BASE_STORAGE_KEY, DEFAULT_API } from "./server-config";

export interface StartupErrorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type NativeApplication = Pick<
  typeof Application,
  "applicationId" | "nativeApplicationVersion" | "nativeBuildVersion"
>;

const KEY = "rakazo.startup-error";
const MAX_LENGTH = 8_192;
const EXPO_LOG_KEY = "rakazo.expo-error-window";

type ExpoErrorWindow = { server: string; since: number; reportedThrough: number };

/**
 * What this process already knows about the launch-path keys. Each secure read decrypts on the
 * Keystore, so a value is read once and kept current by the writes made here. `server` is
 * dropped when the selected server changes; `window` is null once known to be absent.
 */
type Known = { server?: string; window?: ExpoErrorWindow | null; errorEmpty?: boolean };
let known = new WeakMap<StartupErrorStorage, Known>();

function knownFor(storage: StartupErrorStorage): Known {
  const entry = known.get(storage) ?? {};
  known.set(storage, entry);
  return entry;
}

/** Forget the cached server so the next crash record reads the stored one. */
export function forgetSelectedServer(storage?: StartupErrorStorage): void {
  if (storage) delete knownFor(storage).server;
}

/** For tests: start from an empty process. */
export function resetStartupMemo(): void {
  known = new WeakMap();
}

function expoErrorWindow(storage: StartupErrorStorage): ExpoErrorWindow | undefined {
  const entry = knownFor(storage);
  entry.window ??= readExpoErrorWindow(storage) ?? null;
  return entry.window ?? undefined;
}

function writeExpoErrorWindow(storage: StartupErrorStorage, window: ExpoErrorWindow): void {
  storage.setItem(EXPO_LOG_KEY, JSON.stringify(window));
  knownFor(storage).window = window;
}

function readExpoErrorWindow(storage: StartupErrorStorage): ExpoErrorWindow | undefined {
  const raw = storage.getItem(EXPO_LOG_KEY);
  if (!raw || raw.length > 1_024) return;
  const value = JSON.parse(raw) as Partial<ExpoErrorWindow> | null;
  if (
    value &&
    typeof value.server === "string" &&
    typeof value.since === "number" &&
    Number.isFinite(value.since) &&
    typeof value.reportedThrough === "number" &&
    Number.isFinite(value.reportedThrough)
  )
    return value as ExpoErrorWindow;
}

/** Only errors recorded after a known server boundary can be replayed safely. */
export function startExpoErrorWindow(
  storage?: StartupErrorStorage,
  base?: string,
): ExpoErrorWindow | undefined {
  if (!storage) return;
  try {
    const server = base ? new URL(base).origin : selectedServer(storage);
    let existing: ExpoErrorWindow | undefined;
    try {
      existing = expoErrorWindow(storage);
    } catch {
      // A malformed checkpoint starts a new window; older logs have no established owner.
    }
    if (existing?.server === server) return existing;
    const window = { server, since: Date.now(), reportedThrough: 0 };
    writeExpoErrorWindow(storage, window);
    return window;
  } catch {
    return;
  }
}

export function markExpoErrorReported(
  timestamp: number,
  storage: StartupErrorStorage | undefined,
  base: string,
): void {
  if (!storage) return;
  try {
    const current = expoErrorWindow(storage);
    if (!current || current.server !== new URL(base).origin) return;
    // Copy: a failed write must leave the report eligible for retry in this process too.
    writeExpoErrorWindow(storage, {
      ...current,
      reportedThrough: Math.max(current.reportedThrough, timestamp),
    });
  } catch {
    // A failed checkpoint leaves the report eligible for retry.
  }
}

/** The origin of the saved server, read from secure storage once per process. */
export function selectedServer(storage: StartupErrorStorage): string {
  const entry = knownFor(storage);
  entry.server ??= new URL(storage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_API).origin;
  return entry.server;
}

/** Synchronous because React Native's fatal handler may terminate before a write promise runs. */
export function saveStartupError(
  error: unknown,
  storage: StartupErrorStorage | undefined,
  application: NativeApplication | undefined,
): void {
  if (!storage) return;
  try {
    const safe = sanitizedError(error);
    const { applicationId, nativeApplicationVersion, nativeBuildVersion } = application ?? {};
    const record = {
      server: selectedServer(storage),
      // The native SDK's default release, so the next launch reports the build that crashed.
      ...(applicationId && nativeApplicationVersion && nativeBuildVersion
        ? {
            release: `${applicationId}@${nativeApplicationVersion}+${nativeBuildVersion}`,
            dist: nativeBuildVersion,
          }
        : {}),
      name: safe.name.slice(0, 128),
      message: safe.message.slice(0, 1_024),
      stack: safe.stack?.slice(0, 4_096),
    };
    let serialized = JSON.stringify(record);
    if (serialized.length > MAX_LENGTH && record.stack) {
      // Escaped characters can occupy several characters in JSON. Preserve the message
      // and shorten the stack until the final record fits the reader's size limit.
      record.stack = record.stack.slice(
        0,
        Math.max(0, record.stack.length - (serialized.length - MAX_LENGTH)),
      );
      serialized = JSON.stringify(record);
    }
    if (serialized.length <= MAX_LENGTH) {
      knownFor(storage).errorEmpty = false;
      storage.setItem(KEY, serialized);
    }
  } catch {
    // Locked storage or a missing native host must not replace the original fatal error.
  }
}

export function readStartupError(
  storage?: StartupErrorStorage,
): { error: Error; release?: string; dist?: string } | undefined {
  if (!storage) return;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) knownFor(storage).errorEmpty = true;
    if (!raw || raw.length > MAX_LENGTH) return;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return;
    const stored = value as {
      server?: unknown;
      name?: unknown;
      message?: unknown;
      stack?: unknown;
      release?: unknown;
      dist?: unknown;
    };
    // A failed best-effort wipe must never send another server's report after a restart.
    if (stored.server !== selectedServer(storage)) return;
    if (typeof stored.message !== "string" || typeof stored.name !== "string") return;
    const error = new Error(stored.message);
    error.name = stored.name;
    if (typeof stored.stack === "string") error.stack = stored.stack;
    return {
      error: sanitizedError(error),
      release: typeof stored.release === "string" ? stored.release : undefined,
      dist: typeof stored.dist === "string" ? stored.dist : undefined,
    };
  } catch {
    return;
  }
}

/** Skips the write, an encrypt plus a disk sync, when the record is already known to be empty. */
export function clearStartupError(storage?: StartupErrorStorage): void {
  if (!storage || knownFor(storage).errorEmpty) return;
  try {
    storage.setItem(KEY, "");
    knownFor(storage).errorEmpty = true;
  } catch {
    // Reporting remains optional when secure storage is unavailable.
  }
}
