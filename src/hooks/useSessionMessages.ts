import { useCallback, useEffect, useState } from "react";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import { extractMessageFromEvent } from "../lib/eventMessages.ts";
import {
  extractMessageInputs,
  mergeMessageLists,
  putMessages,
  readMessages,
  sessionCacheKey,
  cacheKey,
  toCachedMessages,
  type CachedMessage,
} from "../lib/messageCache.ts";
import { listMessages, type ServerConfig } from "../lib/opencode.ts";

/** How many messages become visible per infinite-scroll page. */
export const SESSION_PAGE_SIZE = 25;

export type SessionMessageSource = "live" | "cache" | "offline-cache";

export interface SessionMessageState {
  /** Oldest first (chat style), current infinite-scroll window (newest N). */
  visible: CachedMessage[];
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  /** True until the IndexedDB cache answered. */
  loading: boolean;
  /** True while the network refresh is in flight. */
  refreshing: boolean;
  error: string | null;
  source: SessionMessageSource;
  liveCount: number;
  /** Optimistically append a local message (oldest first, newest at bottom); returns the temp id. */
  addLocalMessage: (role: string, text: string) => string;
  /** Drop a local message again (e.g. after a failed send). */
  dropLocalMessage: (localID: string) => void;
}

/**
 * Cache-first session messages: IndexedDB first, then network merge, then
 * live event updates. Chat style: oldest first, newest at the bottom; the
 * window holds the newest N (`all` stays newest-first for eviction), paging
 * grows upward via `loadMore`.
 */
export function useSessionMessages(
  server: ServerConfig | null | undefined,
  sessionID: string | undefined,
  pageSize: number = SESSION_PAGE_SIZE,
): SessionMessageState {
  const [all, setAll] = useState<CachedMessage[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(pageSize);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SessionMessageSource>("live");
  const [liveCount, setLiveCount] = useState<number>(0);
  const [local, setLocal] = useState<CachedMessage[]>([]);

  useEffect(() => {
    if (server === null || server === undefined || sessionID === undefined) {
      setAll([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const activeServer: ServerConfig = server;
    const activeSession: string = sessionID;
    let cancelled = false;

    setAll([]);
    setVisibleCount(pageSize);
    setLiveCount(0);
    setLocal([]);
    setError(null);
    setSource("live");
    setLoading(true);
    setRefreshing(false);

    async function load(): Promise<void> {
      const cached = await readMessages(activeServer.id, activeSession);
      if (cancelled) return;
      setAll(cached);
      if (cached.length > 0) setSource("cache");
      setLoading(false);

      setRefreshing(true);
      const result = await listMessages(activeServer, activeSession);
      if (cancelled) return;
      setRefreshing(false);
      if (result.error !== null) {
        setError(result.error);
        setSource(cached.length > 0 ? "offline-cache" : "live");
        return;
      }
      const incoming = toCachedMessages(
        activeServer.id,
        activeSession,
        extractMessageInputs(result.data),
      );
      const merged = mergeMessageLists(cached, incoming);
      // Persist before rendering so a fast reload/navigation still hits the cache.
      await putMessages(
        activeServer.id,
        activeSession,
        merged.map((message) => ({
          id: message.messageID,
          role: message.role,
          text: message.text,
          created: message.created,
        })),
      );
      if (cancelled) return;
      setAll(merged);
      setSource("live");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [server, sessionID, pageSize]);

  useEffect(() => {
    if (server === null || server === undefined || sessionID === undefined) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = sessionID;
    return subscribeServerEvents(activeServer, (event: unknown) => {
      const message = extractMessageFromEvent(event);
      if (message === null || message.sessionID !== activeSession) return;
      const input = {
        id: message.messageID,
        role: message.role,
        text: message.text,
        created: message.created,
      };
      setAll((prev) => mergeMessageLists(prev, toCachedMessages(activeServer.id, activeSession, [input])));
      setLiveCount((count) => count + 1);
      setSource("live");
      void putMessages(activeServer.id, activeSession, [input]);
    });
  }, [server, sessionID]);

  const loadMore = useCallback(() => {
    setVisibleCount((count) => count + pageSize);
  }, [pageSize]);

  const addLocalMessage = useCallback(
    (role: string, text: string): string => {
      const now = Date.now();
      const localID = `lokal-${now}`;
      if (server === null || server === undefined || sessionID === undefined) return localID;
      const message: CachedMessage = {
        key: cacheKey(server.id, sessionID, localID),
        sessionKey: sessionCacheKey(server.id, sessionID),
        serverID: server.id,
        sessionID,
        messageID: localID,
        role,
        text,
        created: now,
      };
      // Deliberately not persisted: the server echo arrives with its own id.
      // Oldest first (chat style): local messages append at the bottom.
      setLocal((prev) => [...prev.filter((m) => m.messageID !== localID), message]);
      return localID;
    },
    [server, sessionID],
  );

  const dropLocalMessage = useCallback((localID: string) => {
    setLocal((prev) => prev.filter((m) => m.messageID !== localID));
  }, []);

  // Chat style: `all` is newest-first (eviction order), the visible window
  // shows the newest N oldest-first — oldest at the top, newest at the bottom.
  const visible = [...all.slice(0, visibleCount)].reverse().concat(local);
  return {
    visible,
    total: local.length + all.length,
    hasMore: visibleCount < all.length,
    loadMore,
    loading,
    refreshing,
    error,
    source,
    liveCount,
    addLocalMessage,
    dropLocalMessage,
  };
}
