import type { ActivityIndicatorProps } from "react-native";
import { ActivityIndicator, Text, View } from "react-native";
import { useDisplayMode } from "../lib/display-mode";

/** A spinner that is never drawn in e-ink, where every frame ghosts: a still "…" stands in. */
export function MotionSpinner({
  color,
  style,
  accessibilityLabel,
  ...rest
}: ActivityIndicatorProps) {
  if (useDisplayMode() !== "eink")
    return (
      <ActivityIndicator
        color={color}
        style={style}
        accessibilityLabel={accessibilityLabel}
        {...rest}
      />
    );
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Text style={{ color: typeof color === "string" ? color : undefined, textAlign: "center" }}>
        …
      </Text>
    </View>
  );
}
