import * as SplashScreen from "expo-splash-screen";
import { getCachedDisplayMode } from "./display-mode";

/** Hide the native splash; e-ink skips the fade, which would only add ghosting refreshes. */
export function hideSplash(): Promise<void> {
  if (getCachedDisplayMode() === "eink") SplashScreen.setOptions({ duration: 0 });
  return SplashScreen.hideAsync();
}
