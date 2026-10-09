import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeServerRunState } from "../lib/eventHub.ts";
import type { ServerConfig } from "../lib/opencode.ts";
import { useSessionTabs } from "../state/sessionTabs.tsx";

/**
 * Sessions with activity the user has not seen yet.
 *
 * The state already exists: the event hub derives a per-session run state
 * (`session.execution.started`, `content.updated`, `retry`, …). This hook reads
 * that state for the loaded session rows and flags every session that becomes
 * active while it is NOT the open one — the unread dot of the session lists.
 * Opening the session clears its dot.
 *
 * No extra request, no new polling: it only observes what the shared stream
 * already computes (and `useLiveRefresh` keeps that stream open on the list
 * pages).
 */
export function useSessionUnread(
  server: ServerConfig | null | undefined,
  sessionIDs: readonly string[],
  activeSessionID: string | null,
): ReadonlySet<string> {
  const [unread, setUnread] = useState<ReadonlySet<string>>(() => new Set<string>());
  // Stable key: the effect must re-subscribe when the row set changes, not on
  // every render that hands over a fresh array.
  const key = sessionIDs.join("\u0000");

  useEffect(() => {
    if (server === null || server === undefined || key === "") return;
    const activeServer: ServerConfig = server;
    const ids = key.split("\u0000");
    const unsubscribes: Array<() => void> = [];
    for (const id of ids) {
      unsubscribes.push(
        subscribeServerRunState(activeServer, id, (state) => {
          if (state.status !== "active") return;
          setUnread((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
        }),
      );
    }
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [server, key]);

  // Opening a session clears its dot.
  useEffect(() => {
    if (activeSessionID === null) return;
    setUnread((prev) =>
      prev.has(activeSessionID)
        ? new Set([...prev].filter((entry) => entry !== activeSessionID))
        : prev,
    );
  }, [activeSessionID]);

  return unread;
}

/** Debounced search value: the overlay queries the server, not per keystroke. */
export function useDebouncedValue(value: string, delayMs = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === "") {
      setDebounced("");
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** A search hit: the session id plus its label (the marker is derived). */
export interface SessionSearchHit {
  id: string;
  label: string;
}

/** Options of a server-side session search (`SessionListInput`). */
export interface SessionSearchOptions {
  search: string;
  limit: number;
  project?: string;
}

/**
 * Server-side session search (`GET /api/session` with `search`/`limit`/
 * `cursor`). `open` gates the requests: the overlay only queries while it is
 * open, so a closed overlay never spends a round-trip.
 */
export function useSessionSearch(
  server: ServerConfig | null | undefined,
  query: string,
  open: boolean,
  project: string | null,
  search: (
    server: ServerConfig,
    options: SessionSearchOptions,
  ) => Promise<{ rows: SessionSearchHit[]; error: string | null }>,
): { hits: SessionSearchHit[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{
    hits: SessionSearchHit[];
    loading: boolean;
    error: string | null;
  }>({ hits: [], loading: false, error: null });
  const searchRef = useRef(search);
  searchRef.current = search;
  const debounced = useDebouncedValue(query);

  useEffect(() => {
    if (!open || server === null || server === undefined || debounced.trim() === "") {
      setState({ hits: [], loading: false, error: null });
      return;
    }
    const activeServer: ServerConfig = server;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    void searchRef
      .current(activeServer, {
        search: debounced,
        limit: 20,
        ...(project === null ? {} : { project }),
      })
      .then((result) => {
        if (cancelled) return;
        setState({ hits: result.rows, loading: false, error: result.error });
      });
    return () => {
      cancelled = true;
    };
  }, [server, debounced, open, project]);

  return state;
}

/** Open-tab lookup for session rows (`useSessionTabs` state, no new fetch). */
export function useOpenSessionTabs(): ReadonlySet<string> {
  const { tabs } = useSessionTabs();
  return useMemo(() => new Set(tabs.map((tab) => tab.sessionID)), [tabs]);
}
