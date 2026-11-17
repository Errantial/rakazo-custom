import { ANDROID_APK_URL, ANDROID_RELEASE_MANIFEST_URL } from "@rakazo/contracts";
import * as Application from "expo-application";
import { Linking } from "react-native";

export type AndroidRelease = { version: string; versionCode: number };

/** The release manifest is fetched from GitHub, so anything malformed reads as no release. */
export function parseAndroidRelease(value: unknown): AndroidRelease | null {
  if (!value || typeof value !== "object") return null;
  const { version, versionCode } = value as Record<string, unknown>;
  if (typeof version !== "string" || !version.trim()) return null;
  if (typeof versionCode !== "number" || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    return null;
  }
  return { version: version.trim(), versionCode };
}

/** This install's Android versionCode, or null where the native module cannot say. */
export function installedVersionCode(): number | null {
  try {
    const code = Number(Application.nativeBuildVersion);
    return Number.isSafeInteger(code) && code > 0 ? code : null;
  } catch {
    return null;
  }
}

/** The published APK when it is newer than this install; null when this install is current. */
export async function newerAndroidRelease(
  installed: number | null = installedVersionCode(),
  fetchManifest: typeof fetch = fetch,
): Promise<AndroidRelease | null> {
  const response = await fetchManifest(ANDROID_RELEASE_MANIFEST_URL, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`Release manifest returned ${response.status}`);
  const release = parseAndroidRelease(await response.json());
  if (!release) throw new Error("Release manifest is malformed");
  return installed === null || release.versionCode > installed ? release : null;
}

/** Android downloads the APK in the browser, then offers to install it over this app. */
export function openAndroidRelease(): Promise<void> {
  return Linking.openURL(ANDROID_APK_URL).catch(() => undefined);
}
