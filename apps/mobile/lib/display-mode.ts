import { parseBotAvatarValue } from "@rakazo/contracts";
import type { DisplayMode } from "@rakazo/ui-tokens";
import { einkBotColor, normalizeDisplayMode, UI_DISPLAY_STORAGE_KEY } from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { isEinkDevice } from "./device-profile";

export type { DisplayMode };

// Unset follows the device and is never written: only an explicit choice is stored.
let memoryMode: DisplayMode | null = null;
let writeGeneration = 0;
const listeners = new Set<() => void>();

function defaultMode(): DisplayMode {
  return isEinkDevice() ? "eink" : "standard";
}

export function getCachedDisplayMode(): DisplayMode {
  return memoryMode ?? defaultMode();
}

export async function loadDisplayMode(): Promise<DisplayMode> {
  try {
    memoryMode = normalizeDisplayMode(await SecureStore.getItemAsync(UI_DISPLAY_STORAGE_KEY));
  } catch {
    // Keep whatever is in memory when SecureStore is unavailable.
  }
  notify();
  return getCachedDisplayMode();
}

export async function setDisplayMode(mode: DisplayMode): Promise<DisplayMode> {
  memoryMode = mode;
  const generation = ++writeGeneration;
  notify();
  await persistDisplayMode(mode, generation);
  return mode;
}

export function subscribeDisplayMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(subscribeDisplayMode, getCachedDisplayMode, defaultMode);
}

/** A bot's stored avatar value, with its identity color replaced by ink in e-ink. */
export function mobileBotColor(color: string): string {
  if (getCachedDisplayMode() !== "eink") return color;
  const parsed = parseBotAvatarValue(color);
  if (parsed.kind === "color") return einkBotColor;
  if (parsed.kind === "shape") return `${einkBotColor}::shape_${parsed.shapeIndex}`;
  return color;
}

function notify() {
  for (const listener of listeners) listener();
}

async function persistDisplayMode(mode: DisplayMode, generation: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(UI_DISPLAY_STORAGE_KEY, mode);
  } catch {
    // Keep the in-memory mode when SecureStore is unavailable.
    return;
  }
  if (generation === writeGeneration) return;
  const latest = memoryMode;
  if (latest === null) return;
  await persistDisplayMode(latest, writeGeneration);
}
