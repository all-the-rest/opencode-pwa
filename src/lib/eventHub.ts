/**
 * Shared per-server event stream hub.
 *
 * Exactly one `subscribeEvents` stream exists per server id, no matter how
 * many hooks listen. The hub fans events out to all listeners, reconnects
 * with capped backoff, and aborts the underlying stream (AbortController
 * cleanup) once the last listener unsubscribes or the server config changes.
 */

import { subscribeEvents, type ServerConfig } from "./opencode.ts";

export type ServerEventListener = (event: unknown) => void;

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

interface HubEntry {
  server: ServerConfig;
  fingerprint: string;
  listeners: Set<ServerEventListener>;
  controller: AbortController;
  started: boolean;
  backoffMs: number;
}

const hubs = new Map<string, HubEntry>();

function fingerprint(server: ServerConfig): string {
  return `${server.baseUrl} ${server.username} ${server.password}`;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function pump(entry: HubEntry, id: string): Promise<void> {
  while (hubs.get(id) === entry && !entry.controller.signal.aborted && entry.listeners.size > 0) {
    const signal = entry.controller.signal;
    try {
      for await (const event of subscribeEvents(entry.server, signal)) {
        if (signal.aborted) return;
        entry.backoffMs = INITIAL_BACKOFF_MS;
        for (const listener of [...entry.listeners]) {
          try {
            listener(event);
          } catch {
            // A faulty listener must not break fan-out to the others.
          }
        }
      }
      if (signal.aborted || entry.listeners.size === 0) return;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await delay(entry.backoffMs, signal);
    } catch {
      return;
    }
    entry.backoffMs = Math.min(entry.backoffMs * 2, MAX_BACKOFF_MS);
  }
}

/**
 * Subscribe to the shared stream of `server`. Returns an unsubscribe
 * function; the underlying stream is aborted when the last listener leaves.
 */
export function subscribeServerEvents(
  server: ServerConfig,
  listener: ServerEventListener,
): () => void {
  let entry = hubs.get(server.id);
  if (entry === undefined || entry.fingerprint !== fingerprint(server)) {
    entry?.controller.abort();
    if (entry !== undefined) hubs.delete(server.id);
    const fresh: HubEntry = {
      server,
      fingerprint: fingerprint(server),
      listeners: new Set(),
      controller: new AbortController(),
      started: false,
      backoffMs: INITIAL_BACKOFF_MS,
    };
    hubs.set(server.id, fresh);
    entry = fresh;
  } else {
    entry.server = server;
  }
  const active: HubEntry = entry;
  active.listeners.add(listener);
  if (!active.started) {
    active.started = true;
    void pump(active, server.id);
  }
  return () => {
    const current = hubs.get(server.id);
    if (current === undefined) return;
    // Only remove when the listener belongs to the current generation.
    if (current === active) {
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        current.controller.abort();
        hubs.delete(server.id);
      }
    } else {
      active.listeners.delete(listener);
    }
  };
}

/** Test-only helper: abort every hub and drop all state. */
export function resetEventHubsForTests(): void {
  for (const entry of hubs.values()) entry.controller.abort();
  hubs.clear();
}

/** Test-only helper: how many server streams are currently running. */
export function activeEventHubCountForTests(): number {
  return hubs.size;
}
