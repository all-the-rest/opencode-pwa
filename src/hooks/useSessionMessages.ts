import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import {
  extractContentUpdateMessage,
  extractMessageFromEvent,
  extractStreamDelta,
  foldStreamDelta,
  latestSessionMeta,
} from "../lib/eventMessages.ts";
import {
  extractMessageInputs,
  mergeMessageLists,
  putMessages,
  readMessages,
  sessionCacheKey,
  cacheKey,
  toCachedMessages,
  type CachedMessage,
  type MessageInput,
} from "../lib/messageCache.ts";
import { listMessages, type ServerConfig } from "../lib/opencode.ts";

/** How many messages become visible per infinite-scroll page. */
export const SESSION_PAGE_SIZE = 25;

/** A row on screen as a cache write (`putMessages` takes this shape). */
function toWriteInput(message: CachedMessage): MessageInput {
  return {
    id: message.messageID,
    role: message.role,
    text: message.text,
    created: message.created,
    noteKind: message.noteKind,
    noteDetail: message.noteDetail,
    parts: message.parts,
    agent: message.agent,
    model: message.model,
    durationMs: message.durationMs,
  };
}

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
  // Agent/model of the last turn that declared them. Streaming snapshots
  // (`session.message.content.updated`) repeat only the content array, so the
  // live bubble would otherwise show an empty `agent · model` header until the
  // full message arrives. The ref keeps the event subscription stable.
  const sessionMetaRef = useRef(latestSessionMeta([]));

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
      // Persist before rendering so a fast reload/navigation still hits the cache.
      await putMessages(activeServer.id, activeSession, incoming.map(toWriteInput));
      if (cancelled) return;
      // Merge into what is on screen *now*, not into the cache snapshot this
      // load started from: the first `listMessages` of a mount resolves while
      // the turn is already streaming, and those rows live only in memory (a
      // half-streamed message is never written to the cache). Replacing the list
      // with the response would wipe them — the reasoning would vanish and
      // reappear with the next frame. A row the response does carry still wins,
      // so an authoritative refresh never loses to a streamed one.
      setAll((prev) => mergeMessageLists(prev, incoming));
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
      // Live streaming, cheapest path first: a `session.text.delta` /
      // `session.reasoning.delta` / `session.tool.input.delta` frame carries one
      // fragment (measured: 92 reasoning frames in 12 s). It is folded into the
      // row it names — appended to the part its `ordinal` addresses, creating a
      // placeholder row when the stream names the assistant message before any
      // snapshot does — and never written to the cache, because half-streamed
      // state is not a final message.
      const delta = extractStreamDelta(event);
      if (delta !== null) {
        if (delta.sessionID !== activeSession) return;
        // Returning the previous array when the frame changes nothing lets
        // React bail out instead of re-rendering the list for a no-op frame.
        setAll((prev) =>
          foldStreamDelta(prev, delta, {
            serverID: activeServer.id,
            meta: sessionMetaRef.current,
          }),
        );
        // `liveCount` drives the streaming stickiness in SessionDetail, so it
        // has to move even for a frame that only confirms a stream is alive.
        setLiveCount((count) => count + 1);
        setSource("live");
        return;
      }
      // Live streaming: fold assistant content snapshots (text arriving
      // incrementally) into the cached message, keyed by the message id. This
      // replaces the previous mis-parse of `content.updated` into an
      // "Unbekannter Inhalt" note that then got persisted as if final.
      const update = extractContentUpdateMessage(event, Date.now(), sessionMetaRef.current);
      if (update !== null) {
        if (update.sessionID !== activeSession) return;
        const rows = toCachedMessages(activeServer.id, activeSession, [
          {
            id: update.messageID,
            role: update.role,
            text: update.text,
            created: update.created,
            noteKind: update.noteKind,
            noteDetail: update.noteDetail,
            parts: update.parts,
            agent: update.agent,
            model: update.model,
            durationMs: update.durationMs,
          },
        ]);
        // A snapshot replaces the streamed row wholesale — never merged into it.
        setAll((prev) => mergeMessageLists(prev, rows));
        setLiveCount((count) => count + 1);
        setSource("live");
        // `putMessages` downgrades in-flight tool parts (and drops live parts)
        // before writing, so a snapshot captured mid-run never persists a stale
        // "Läuft" or half-streamed text.
        void putMessages(activeServer.id, activeSession, rows.map(toWriteInput));
        return;
      }
      const message = extractMessageFromEvent(event);
      if (message === null || message.sessionID !== activeSession) return;
      const rows = toCachedMessages(activeServer.id, activeSession, [
        {
          id: message.messageID,
          role: message.role,
          text: message.text,
          created: message.created,
          noteKind: message.noteKind,
          noteDetail: message.noteDetail,
          parts: message.parts,
          agent: message.agent,
          model: message.model,
          durationMs: message.durationMs,
        },
      ]);
      setAll((prev) => mergeMessageLists(prev, rows));
      setLiveCount((count) => count + 1);
      setSource("live");
      void putMessages(activeServer.id, activeSession, rows.map(toWriteInput));
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
        noteKind: null,
        noteDetail: null,
        parts: [{ kind: "text", text }],
        agent: null,
        model: null,
        durationMs: null,
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
  // Synced after render (never during it), so the streaming fallback in the
  // event subscription above always sees the current session meta without the
  // subscription having to re-subscribe.
  useEffect(() => {
    sessionMetaRef.current = latestSessionMeta(all);
  }, [all]);
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
