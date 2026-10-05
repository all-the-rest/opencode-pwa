import { useEffect, useRef } from "react";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import type { ServerConfig } from "../lib/opencode.ts";

/** Poll interval for live counters (dashboard badges, server detail). */
export const LIVE_REFRESH_INTERVAL_MS = 5000;

/**
 * Keep a view live: re-run `reload` every `intervalMs` and additionally on
 * every event-hub activity of `server`. The shared hub keeps exactly one
 * stream per server; polling covers missed/silent periods.
 */
export function useLiveRefresh(
  server: ServerConfig | null,
  reload: () => void,
  intervalMs: number = LIVE_REFRESH_INTERVAL_MS,
): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (server === null) return;
    const active: ServerConfig = server;
    const timer = setInterval(() => {
      reloadRef.current();
    }, intervalMs);
    const unsubscribe = subscribeServerEvents(active, () => {
      reloadRef.current();
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [server, intervalMs]);
}
