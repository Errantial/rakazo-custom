import type { AppearancePreference, ResolvedAppearance } from "@rakazo/ui-tokens";
import {
  normalizeAppearancePreference,
  resolveAppearance,
  tokensForDisplay,
  UI_APPEARANCE_STORAGE_KEY,
} from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import type { ColorSchemeName } from "react-native";
import { Appearance } from "react-native";
import { getCachedDisplayMode, subscribeDisplayMode } from "./display-mode";
import { forgetPrefetched, readSecureValue } from "./prefetch";

export type { AppearancePreference, ResolvedAppearance };

let memoryPreference: AppearancePreference | null = null;
let writeGeneration = 0;
const listeners = new Set<() => void>();

function systemAppearance(scheme?: ColorSchemeName | null): ResolvedAppearance {
  return (scheme ?? Appearance.getColorScheme()) === "light" ? "light" : "dark";
}

export function getCachedAppearancePreference(): AppearancePreference {
  return memoryPreference ?? "system";
}

export async function loadAppearancePreference(): Promise<AppearancePreference> {
  try {
    const stored = await readSecureValue(SecureStore, UI_APPEARANCE_STORAGE_KEY);
    memoryPreference = normalizeAppearancePreference(stored);
  } catch {
    memoryPreference = memoryPreference ?? "system";
  }
  applyNativeColorScheme(memoryPreference);
  notify();
  return memoryPreference;
}

export async function setAppearancePreference(
  preference: AppearancePreference,
): Promise<AppearancePreference> {
  memoryPreference = preference;
  const generation = ++writeGeneration;
  applyNativeColorScheme(preference);
  notify();
  await persistAppearancePreference(preference, generation);
  return preference;
}

export function resolveMobileAppearance(
  preference: AppearancePreference = getCachedAppearancePreference(),
  scheme?: ColorSchemeName | null,
): ResolvedAppearance {
  // E-ink has no dark: it forces light so native chrome (status bar, keyboard) matches.
  if (getCachedDisplayMode() === "eink") return "light";
  return resolveAppearance(preference, systemAppearance(scheme));
}

export function mobileTokens(
  preference: AppearancePreference = getCachedAppearancePreference(),
  scheme?: ColorSchemeName | null,
) {
  return tokensForDisplay(resolveMobileAppearance(preference, scheme), getCachedDisplayMode());
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

async function persistAppearancePreference(
  preference: AppearancePreference,
  generation: number,
): Promise<void> {
  try {
    forgetPrefetched(UI_APPEARANCE_STORAGE_KEY);
    await SecureStore.setItemAsync(UI_APPEARANCE_STORAGE_KEY, preference);
  } catch {
    // Keep the in-memory preference when SecureStore is unavailable.
    return;
  }
  if (generation === writeGeneration) return;
  const latest = memoryPreference;
  if (latest === null) return;
  await persistAppearancePreference(latest, writeGeneration);
}

// Native surfaces (alerts, action sheets, the keyboard, iOS platform colors) follow the
// window's scheme, so an explicit app choice overrides it and System hands it back to the OS.
function applyNativeColorScheme(preference: AppearancePreference) {
  if (getCachedDisplayMode() === "eink") {
    Appearance.setColorScheme("light");
    return;
  }
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

subscribeDisplayMode(() => applyNativeColorScheme(getCachedAppearancePreference()));

Appearance.addChangeListener(() => {
  if (getCachedAppearancePreference() === "system") notify();
});
