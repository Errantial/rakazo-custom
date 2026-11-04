import { LOGO_AVATAR_LOOP_MS } from "@rakazo/core";
import { useEffect, useRef } from "react";
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { lifeMotionPreference } from "./motion";

/** Native UI-thread clock. Activity/rerender changes do not restart its elapsed phase. */
export function useLogoAvatarClock(running: boolean) {
  const milliseconds = useSharedValue(0);
  const mirror = useRef({ elapsed: 0, since: null as number | null });
  useEffect(() => {
    if (!running) return;
    const base = mirror.current.elapsed;
    mirror.current = { elapsed: base, since: performance.now() };
    milliseconds.value = base;
    milliseconds.value = withRepeat(
      withTiming(base + LOGO_AVATAR_LOOP_MS, {
        duration: LOGO_AVATAR_LOOP_MS,
        easing: Easing.linear,
        reduceMotion: lifeMotionPreference(),
      }),
      -1,
      false,
      undefined,
      lifeMotionPreference(),
    );
    return () => {
      const started = mirror.current;
      mirror.current = {
        elapsed:
          started.elapsed + Math.max(0, performance.now() - (started.since ?? performance.now())),
        since: null,
      };
      cancelAnimation(milliseconds);
      milliseconds.value = mirror.current.elapsed;
    };
  }, [running, milliseconds]);
  return milliseconds;
}
