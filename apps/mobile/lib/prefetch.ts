import { UI_APPEARANCE_STORAGE_KEY, UI_DISPLAY_STORAGE_KEY } from "@rakazo/ui-tokens";
import {
  API_BASE_STORAGE_KEY,
  SERVER_HEADERS_STORAGE_KEY,
  SPACE_STORAGE_KEY,
  UI_LOCALE_STORAGE_KEY,
} from "./server-config";

type SecureReader = { getItemAsync(key: string): Promise<string | null> };

/** What the layout's startup gate reads, so the Keystore works while the app's modules load. */
const LAUNCH_KEYS = [
  API_BASE_STORAGE_KEY,
  SERVER_HEADERS_STORAGE_KEY,
  SPACE_STORAGE_KEY,
  UI_APPEARANCE_STORAGE_KEY,
  UI_DISPLAY_STORAGE_KEY,
  UI_LOCALE_STORAGE_KEY,
];

const prefetched = new Map<string, Promise<string | null>>();

/** Call first in the entry file, before anything heavy loads. Never throws. */
export function prefetchSecureValues(store: SecureReader): void {
  for (const key of LAUNCH_KEYS) {
    try {
      const read = store.getItemAsync(key);
      read.catch(() => undefined); // Unused, a failed read must not become an unhandled rejection.
      prefetched.set(key, read);
    } catch {
      // The caller reads the key itself.
    }
  }
}

/** The prefetched value the first time a key is read, then a normal read. */
export function readSecureValue(store: SecureReader, key: string): Promise<string | null> {
  const read = prefetched.get(key);
  prefetched.delete(key);
  return read ?? store.getItemAsync(key);
}

/** Call before writing or deleting `key`, so a read begun earlier is never returned after it. */
export function forgetPrefetched(key: string): void {
  prefetched.delete(key);
}
