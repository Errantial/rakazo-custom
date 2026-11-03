import { Platform } from "react-native";

/** Android build identity, as exposed by React Native's `Platform.constants`. */
type DeviceConstants = { Manufacturer?: string; Brand?: string; Model?: string };

const EINK_PATTERN = /mudita/i;

/** True on Android devices whose manufacturer or brand identifies an e-ink phone (Mudita Kompakt). */
export function isEinkDevice(
  constants: DeviceConstants = Platform.constants as DeviceConstants,
): boolean {
  if (Platform.OS !== "android") return false;
  return EINK_PATTERN.test(constants.Manufacturer ?? "") || EINK_PATTERN.test(constants.Brand ?? "");
}
