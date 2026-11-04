import { einkBotColor, einkTokens, tokensForAppearance } from "@rakazo/ui-tokens";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
let colorSchemeOverride: "light" | "dark" | null = null;
let eink = false;

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

vi.mock("react-native", () => ({
  Appearance: {
    getColorScheme: () => colorSchemeOverride ?? "dark",
    setColorScheme: (scheme: "light" | "dark" | "unspecified") => {
      colorSchemeOverride = scheme === "unspecified" ? null : scheme;
    },
    addChangeListener: () => ({ remove() {} }),
  },
}));

vi.mock("./device-profile", () => ({ isEinkDevice: () => eink }));

async function modules() {
  return {
    display: await import("./display-mode"),
    appearance: await import("./appearance"),
  };
}

describe("display mode", () => {
  beforeEach(() => {
    store.clear();
    colorSchemeOverride = null;
    eink = false;
    vi.resetModules();
  });

  it("defaults to e-ink on a Mudita device and standard elsewhere, without persisting", async () => {
    eink = true;
    let { display } = await modules();
    expect(await display.loadDisplayMode()).toBe("eink");
    expect(display.getCachedDisplayMode()).toBe("eink");
    expect(store.size).toBe(0);

    eink = false;
    vi.resetModules();
    ({ display } = await modules());
    expect(await display.loadDisplayMode()).toBe("standard");
  });

  it("keeps a stored standard choice on a Mudita device", async () => {
    eink = true;
    store.set("rakazo.uiDisplay", "standard");
    const { display } = await modules();
    expect(await display.loadDisplayMode()).toBe("standard");
  });

  it("ignores an invalid stored value", async () => {
    store.set("rakazo.uiDisplay", "sepia");
    const { display } = await modules();
    expect(await display.loadDisplayMode()).toBe("standard");
  });

  it("persists an explicit choice and notifies subscribers", async () => {
    const { display } = await modules();
    const listener = vi.fn();
    const unsubscribe = display.subscribeDisplayMode(listener);
    await display.setDisplayMode("eink");
    expect(store.get("rakazo.uiDisplay")).toBe("eink");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await display.setDisplayMode("standard");
    expect(listener).not.toHaveBeenCalled();
  });

  it("makes e-ink force light tokens and native scheme, then restores the preference", async () => {
    const { display, appearance } = await modules();
    await appearance.setAppearancePreference("dark");
    expect(appearance.mobileTokens()).toEqual(tokensForAppearance("dark"));

    await display.setDisplayMode("eink");
    expect(appearance.mobileTokens()).toEqual(einkTokens);
    expect(appearance.resolveMobileAppearance()).toBe("light");
    expect(colorSchemeOverride).toBe("light");

    await display.setDisplayMode("standard");
    expect(appearance.mobileTokens()).toEqual(tokensForAppearance("dark"));
    expect(appearance.resolveMobileAppearance()).toBe("dark");
    expect(colorSchemeOverride).toBe("dark");
  });

  it("hands System back to the OS when e-ink turns off", async () => {
    const { display } = await modules();
    await display.setDisplayMode("eink");
    expect(colorSchemeOverride).toBe("light");
    await display.setDisplayMode("standard");
    expect(colorSchemeOverride).toBeNull();
  });

  it("uses the e-ink bot color only in e-ink", async () => {
    const { display } = await modules();
    expect(display.mobileBotColor("#F97316")).toBe("#F97316");
    await display.setDisplayMode("eink");
    expect(display.mobileBotColor("#F97316")).toBe(einkBotColor);
    expect(display.mobileBotColor("#F97316::shape_2")).toBe(`${einkBotColor}::shape_2`);
    expect(display.mobileBotColor("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});
