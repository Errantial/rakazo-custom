import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { rpc } from "./api";

async function notificationsAllowed() {
  // On iOS getPermissionsAsync holds Expo's shared native queue until the system answers,
  // which can take minutes after a restart, and SecureStore waits behind it. The request
  // does not hold the queue and only prompts while the user hasn't chosen yet.
  if (Platform.OS === "ios") return (await Notifications.requestPermissionsAsync()).granted;
  const existing = await Notifications.getPermissionsAsync();
  return existing.granted || (await Notifications.requestPermissionsAsync()).granted;
}

// Set when minting a token fails, so later launch paths in this session skip the attempt.
let mintUnavailable = false;

export async function registerPushToken(): Promise<"registered" | "unavailable" | "denied"> {
  if (mintUnavailable) return "unavailable";
  if (!(await notificationsAllowed())) return "denied";
  try {
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return "unavailable";
    let token: string | undefined;
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      // Expo Go without an EAS project id, Android builds without a Firebase config and
      // phones without Google Play services cannot mint an Expo push token.
      // Only Android skips retries; iOS and other platforms keep trying after a network blip.
      if (Platform.OS === "android") mintUnavailable = true;
      return "unavailable";
    }
    if (!token) return "unavailable";
    await rpc("notifications/registerPush", { token });
    return "registered";
  } catch {
    // A failed registration request is transient, so a later call may try again.
    return "unavailable";
  }
}

export async function unregisterPushToken() {
  await rpc("notifications/unregisterPush").catch(() => undefined);
}
