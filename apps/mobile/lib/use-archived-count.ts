import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { currentApiBase } from "./api";
import {
  archivedChatCounts,
  archivedChatsVersion,
  loadAllArchivedChats as loadArchivedChats,
  onArchivedChatsChanged,
} from "./archived-chats";
import { currentSessionGeneration } from "./session";

/** A count this recent is reused on focus, so leaving a chat for the inbox does not refetch it. */
export const ARCHIVED_COUNT_TTL_MS = 60_000;

/** How many chats this space has archived, for the row at the end of the inbox. */
export function useArchivedCount(spaceId: string | undefined, hasSession: boolean) {
  const [archived, setArchived] = useState({ spaceId: "", count: 0 });
  // All spaces’ archived chats; a list that fails to load keeps its last count.
  const archivedCounts = useRef({ spaceId: "", bots: 0, groups: 0 });
  const archivedRequestId = useRef(0);
  // What the last successful count was loaded for; any change to it makes the count stale.
  const loadedFor = useRef<{ key: string; version: number; at: number } | null>(null);
  const countKey = useCallback(
    () => JSON.stringify([currentApiBase(), currentSessionGeneration(), spaceId]),
    [spaceId],
  );
  // Another space's count never shows while this space's is loading.
  const archivedCount = archived.spaceId === spaceId ? archived.count : 0;
  const loadArchivedCount = useCallback(async () => {
    if (!spaceId) return;
    const requestId = ++archivedRequestId.current;
    const stamp = { key: countKey(), version: archivedChatsVersion(), at: Date.now() };
    const loaded = await loadArchivedChats();
    if (requestId !== archivedRequestId.current) return;
    loadedFor.current = loaded.error ? null : stamp;
    const previous =
      archivedCounts.current.spaceId === spaceId ? archivedCounts.current : { bots: 0, groups: 0 };
    archivedCounts.current = { spaceId, ...archivedChatCounts(previous, loaded) };
    setArchived({ spaceId, count: archivedCounts.current.bots + archivedCounts.current.groups });
  }, [spaceId, countKey]);
  // Not part of the poll: the count changes only through archive and restore, which signal it.
  // A change while another screen is focused is missed by the listener, so focus checks the version.
  useFocusEffect(
    useCallback(() => {
      if (!hasSession) return;
      const last = loadedFor.current;
      const fresh =
        last !== null &&
        last.key === countKey() &&
        last.version === archivedChatsVersion() &&
        Date.now() - last.at < ARCHIVED_COUNT_TTL_MS;
      if (!fresh) void loadArchivedCount();
      return onArchivedChatsChanged(() => void loadArchivedCount());
    }, [hasSession, loadArchivedCount, countKey]),
  );
  return archivedCount;
}
