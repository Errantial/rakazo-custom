import { ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { getCachedDisplayMode, useDisplayMode } from "./display-mode";

/** E-ink panels ghost on every frame, so that mode never moves. Reanimated honors `Always`. */
function preferenceFor(mode: ReturnType<typeof getCachedDisplayMode>): ReduceMotion {
  return mode === "eink" ? ReduceMotion.Always : ReduceMotion.System;
}

/** Whether anything may animate: not in e-ink, not under the OS Reduce Motion setting. */
export function useMotionAllowed(): boolean {
  const eink = useDisplayMode() === "eink";
  return !useReducedMotion() && !eink;
}

/** The `reduceMotion` option for animations started outside render. */
export function motionPreference(): ReduceMotion {
  return preferenceFor(getCachedDisplayMode());
}

/** Same as `motionPreference`, for components that re-render when the mode changes. */
export function useMotionPreference(): ReduceMotion {
  return preferenceFor(useDisplayMode());
}

/** Avatar life ignores the OS setting by design (it only blinks then), but e-ink stops it. */
export function lifeMotionPreference(): ReduceMotion {
  return getCachedDisplayMode() === "eink" ? ReduceMotion.Always : ReduceMotion.Never;
}
