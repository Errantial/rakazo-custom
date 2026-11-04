import * as SplashScreen from "expo-splash-screen";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedDisplayMode } from "./display-mode";
import { hideSplash } from "./splash";

vi.mock("expo-splash-screen", () => ({
  setOptions: vi.fn(),
  hideAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./display-mode", () => ({ getCachedDisplayMode: vi.fn() }));

describe("hideSplash", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drops the fade before hiding in e-ink mode", async () => {
    vi.mocked(getCachedDisplayMode).mockReturnValue("eink");
    await hideSplash();
    expect(SplashScreen.setOptions).toHaveBeenCalledWith({ duration: 0 });
    const [options] = vi.mocked(SplashScreen.setOptions).mock.invocationCallOrder;
    const [hide] = vi.mocked(SplashScreen.hideAsync).mock.invocationCallOrder;
    expect(options).toBeLessThan(hide ?? 0);
  });

  it("keeps the default fade in standard mode", async () => {
    vi.mocked(getCachedDisplayMode).mockReturnValue("standard");
    await hideSplash();
    expect(SplashScreen.setOptions).not.toHaveBeenCalled();
    expect(SplashScreen.hideAsync).toHaveBeenCalledOnce();
  });
});
