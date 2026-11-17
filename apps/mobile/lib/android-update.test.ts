import { ANDROID_RELEASE_MANIFEST_URL } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";

const application = vi.hoisted(() => ({ nativeBuildVersion: "11" as string | null }));

vi.mock("expo-application", () => application);
vi.mock("react-native", () => ({ Linking: { openURL: vi.fn() } }));

const { installedVersionCode, newerAndroidRelease, parseAndroidRelease } = await import(
  "./android-update"
);

function manifest(body: unknown, status = 200) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("Android release check", () => {
  it("reads only a named version with a positive integer versionCode", () => {
    expect(parseAndroidRelease({ version: " 2026.11.1 ", versionCode: 20261101 })).toEqual({
      version: "2026.11.1",
      versionCode: 20261101,
    });
    expect(parseAndroidRelease({ version: "2026.11.1", versionCode: "20261101" })).toBeNull();
    expect(parseAndroidRelease({ version: "", versionCode: 3 })).toBeNull();
    expect(parseAndroidRelease({ version: "1", versionCode: 0 })).toBeNull();
    expect(parseAndroidRelease(null)).toBeNull();
  });

  it("offers a release only when it is newer than this install", async () => {
    const fetchManifest = manifest({ version: "2026.11.1", versionCode: 20261101 });

    await expect(newerAndroidRelease(11, fetchManifest)).resolves.toEqual({
      version: "2026.11.1",
      versionCode: 20261101,
    });
    await expect(newerAndroidRelease(20261101, fetchManifest)).resolves.toBeNull();
    expect(fetchManifest).toHaveBeenCalledWith(ANDROID_RELEASE_MANIFEST_URL, expect.anything());
  });

  it("offers the release when this install's versionCode is unknown", async () => {
    await expect(
      newerAndroidRelease(null, manifest({ version: "2026.11.1", versionCode: 20261101 })),
    ).resolves.toEqual({ version: "2026.11.1", versionCode: 20261101 });
  });

  it("fails rather than reporting up to date when the manifest is missing or malformed", async () => {
    await expect(newerAndroidRelease(11, manifest({}, 404))).rejects.toThrow("404");
    await expect(newerAndroidRelease(11, manifest({ version: "x" }))).rejects.toThrow("malformed");
  });

  it("reads the installed versionCode from the native build version", () => {
    application.nativeBuildVersion = "20261101";
    expect(installedVersionCode()).toBe(20261101);
    application.nativeBuildVersion = null;
    expect(installedVersionCode()).toBeNull();
  });
});
