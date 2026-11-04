import type { DisplayMode } from "@rakazo/ui-tokens";

/** The focused inbox needs to notice new messages, not mirror every server write. */
export const INBOX_POLL_INTERVAL_MS = 15_000;

/** E-ink phones are slow and battery-tight, and the inbox is not a live surface there. */
export const EINK_INBOX_POLL_INTERVAL_MS = 30_000;

export function inboxPollIntervalMs(mode: DisplayMode): number {
  return mode === "eink" ? EINK_INBOX_POLL_INTERVAL_MS : INBOX_POLL_INTERVAL_MS;
}

/** Activity is a secondary surface; a minute keeps it useful without polling constantly. */
export const ACTIVITY_POLL_INTERVAL_MS = 60_000;
