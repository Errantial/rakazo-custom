import * as SecureStore from "expo-secure-store";
import { rpc } from "./api";

export const DEVICE_VOICE_KEY = "rakazo.device-voice";

let available = false;

/**
 * Whether this phone can speak at all. De-Googled phones ship without a text-to-speech
 * engine, so the voice list is empty. Android may also list nothing or fail while the
 * engine is still binding, so only a found voice is kept for the session; an empty list
 * is asked again, and a failed query counts as available so replies never leave the device.
 */
export async function deviceVoiceAvailable(): Promise<boolean> {
  if (available) return true;
  try {
    const Speech = await import("expo-speech");
    available = (await Speech.getAvailableVoicesAsync()).length > 0;
    return available;
  } catch {
    return true;
  }
}

// Counts explicit choices, so a default worked out meanwhile never overwrites one.
let choices = 0;
let lastWrite: Promise<unknown> = Promise.resolve();

function write(on: boolean): Promise<void> {
  const next = lastWrite.then(() => SecureStore.setItemAsync(DEVICE_VOICE_KEY, on ? "1" : "0"));
  lastWrite = next.catch(() => undefined);
  return next;
}

/**
 * Until someone picks a voice, the phone's own is used unless a hosted voice is already set up,
 * so earlier installs keep the provider they connected. The first answer is kept, so later
 * replies don't wait on the server to decide.
 */
export async function loadDeviceVoiceEnabled(): Promise<boolean> {
  const seen = choices;
  const stored = await SecureStore.getItemAsync(DEVICE_VOICE_KEY);
  // An explicit choice wins; availability only decides the default.
  if (stored) return stored === "1";
  if (!(await deviceVoiceAvailable())) return false;
  let ready: boolean;
  try {
    ready = (await rpc("voice/status", { scope: "account" })).ready;
  } catch {
    return true;
  }
  if (choices !== seen) return loadDeviceVoiceEnabled();
  await write(!ready).catch(() => undefined);
  return !ready;
}

export function saveDeviceVoiceEnabled(on: boolean): Promise<void> {
  choices += 1;
  return write(on);
}
