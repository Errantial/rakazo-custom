import { afterEach, describe, expect, it } from "vitest";
import {
  appendKeepRules,
  applyGradleProperties,
  KEEP_RULES,
} from "./with-android-release-optimizations.js";

describe("applyGradleProperties", () => {
  const original = process.env.EAS_BUILD_PROFILE;
  afterEach(() => {
    if (original === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = original;
  });
  const get = (props, key) => props.find((p) => p.key === key)?.value;

  it("turns on R8 and resource shrinking for every build", () => {
    delete process.env.EAS_BUILD_PROFILE;
    const props = applyGradleProperties([{ type: "property", key: "other", value: "1" }]);

    expect(get(props, "android.enableMinifyInReleaseBuilds")).toBe("true");
    expect(get(props, "android.enableShrinkResourcesInReleaseBuilds")).toBe("true");
    expect(get(props, "other")).toBe("1");
  });

  it("limits native libs to arm64 only for the android-apk profile", () => {
    process.env.EAS_BUILD_PROFILE = "android-apk";
    expect(get(applyGradleProperties([]), "reactNativeArchitectures")).toBe("arm64-v8a");
  });

  it("leaves architectures alone for other profiles", () => {
    for (const profile of ["production", undefined]) {
      if (profile) process.env.EAS_BUILD_PROFILE = profile;
      else delete process.env.EAS_BUILD_PROFILE;
      expect(get(applyGradleProperties([]), "reactNativeArchitectures")).toBeUndefined();
    }
  });

  it("overrides existing values without duplicating keys", () => {
    process.env.EAS_BUILD_PROFILE = "android-apk";
    const props = applyGradleProperties([
      { type: "property", key: "reactNativeArchitectures", value: "armeabi-v7a,x86" },
    ]);
    expect(props.filter((p) => p.key === "reactNativeArchitectures")).toEqual([
      { type: "property", key: "reactNativeArchitectures", value: "arm64-v8a" },
    ]);
  });
});

describe("appendKeepRules", () => {
  it("keeps app, Expo, and Reanimated/Worklets classes", () => {
    const result = appendKeepRules("# base\n");

    expect(result).toContain("-keep class com.rakazo.** { *; }");
    expect(result).toContain("-keep class expo.modules.** { *; }");
    expect(result).toContain("-keep class com.swmansion.reanimated.** { *; }");
    expect(result).toContain("-keep class com.swmansion.worklets.** { *; }");
    expect(result.startsWith("# base\n")).toBe(true);
  });

  it("is idempotent", () => {
    const once = appendKeepRules("# base\n");
    expect(appendKeepRules(once)).toBe(once);
    expect(once.split(KEEP_RULES[0]).length).toBe(2);
  });
});
