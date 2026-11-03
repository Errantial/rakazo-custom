import { describe, expect, it } from "vitest";
import {
  KEEP_RULES,
  applyGradleProperties,
  appendKeepRules,
} from "./with-android-release-optimizations.js";

describe("applyGradleProperties", () => {
  it("turns on R8, resource shrinking, and arm64-only native libs", () => {
    const props = applyGradleProperties([{ type: "property", key: "other", value: "1" }]);
    const get = (key) => props.find((p) => p.key === key)?.value;

    expect(get("android.enableMinifyInReleaseBuilds")).toBe("true");
    expect(get("android.enableShrinkResourcesInReleaseBuilds")).toBe("true");
    expect(get("reactNativeArchitectures")).toBe("arm64-v8a");
    expect(get("other")).toBe("1");
  });

  it("overrides existing values without duplicating keys", () => {
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
