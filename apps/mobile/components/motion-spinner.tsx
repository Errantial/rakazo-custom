import type { ActivityIndicatorProps } from "react-native";
import { ActivityIndicator } from "react-native";
import { useDisplayMode } from "../lib/display-mode";

/** A spinner that is never drawn in e-ink, where every frame ghosts. */
export function MotionSpinner(props: ActivityIndicatorProps) {
  if (useDisplayMode() === "eink") return null;
  return <ActivityIndicator {...props} />;
}
