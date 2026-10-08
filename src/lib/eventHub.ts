/**
 * Shared per-server event stream hub.
 *
 * Exactly one `subscribeEvents` stream exists per server id, no matter how
 * many hooks listen. The hub fans events out to all listeners, reconnects
 * with capped backoff, and aborts the underlying stream (AbortController
 * cleanup) once the last listener unsubscribes or the server config changes.
 */

import { credentialRevision } from "./credentialVault.ts";
import { subscribeEvents, type ServerConfig } from "./opencode.ts";

export type ServerEventListener = (event: unknown) => void;

export type SessionRunSubscriber = (state: SessionRunState) => void;

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

// ---------------------------------------------------------------------------
// Session run state (derived from lifecycle events)
//
// A running turn is invisible in the static message list while the provider
// thinks, while text streams in, and while a retry is pending. These lifecycle
// events drive a small, per-session state machine that SessionDetail renders
// (working indicator, retry card, interrupted/error divider). It is derived,
// never persisted: a reload simply starts from `idle` and picks up the current
// step's events.
// ---------------------------------------------------------------------------

/** Coarse status of a session's current turn. */
export type SessionRunStatus = "idle" | "active" | "retry" | "interrupted" | "failed";

/** A scheduled provider retry (`session.retry.scheduled`). */
export interface SessionRunRetry {
  /** Which attempt is being made (1-based). */
  attempt: number;
  /** Timestamp of the next attempt (ms), when the server sent it — countdown base. */
  at: number | null;
  /** Provider error message that triggered the retry. */
  message: string;
}

export interface SessionRunState {
  status: SessionRunStatus;
  sessionID: string;
  /** Assistant message id currently streaming (set on `content.updated`). */
  assistantMessageID: string | null;
  /** Present while `status === "retry"`. */
  retry: SessionRunRetry | null;
  /** Error message of a failed turn (`status === "failed"`). */
  error: string | null;
}

/** The neutral state before any run has been observed. */
export function idleSessionRunState(sessionID: string): SessionRunState {
  return { status: "idle", sessionID, assistantMessageID: null, retry: null, error: null };
}

function eventRecord(event: unknown): Record<string, unknown> | null {
  return event !== null && typeof event === "object" ? (event as Record<string, unknown>) : null;
}

function eventData(event: unknown): Record<string, unknown> | null {
  const root = eventRecord(event);
  if (root === null) return null;
  const data: unknown = root["data"];
  return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function eventSessionID(event: unknown): string | null {
  const data = eventData(event);
  if (data !== null) {
    const id: unknown = data["sessionID"];
    if (typeof id === "string" && id !== "") return id;
    const camel: unknown = data["sessionId"];
    if (typeof camel === "string" && camel !== "") return camel;
  }
  const root = eventRecord(event);
  if (root !== null) {
    const direct: unknown = root["sessionID"];
    if (typeof direct === "string" && direct !== "") return direct;
  }
  return null;
}

/** First non-empty string field of `data`, or null. */
function eventString(data: Record<string, unknown> | null, key: string): string | null {
  if (data === null) return null;
  const value: unknown = data[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** Best human message from a `SessionStructuredError` (`{ message }`). */
function errorMessage(data: Record<string, unknown> | null): string | null {
  if (data === null) return null;
  const error: unknown = data["error"];
  if (error !== null && typeof error === "object") {
    const message: unknown = (error as Record<string, unknown>)["message"];
    if (typeof message === "string" && message !== "") return message;
  }
  const fallback: unknown = data["message"];
  return typeof fallback === "string" && fallback !== "" ? fallback : null;
}

/**
 * Fold one lifecycle event into the session run state. Pure and total: unknown
 * events (or events without a resolvable session) return `prev` unchanged, so
 * the whole message stream can be piped through it. Event types verified in the
 * installed client:
 *   - `session.execution.started|succeeded|failed|interrupted`
 *   - `session.retry.scheduled`
 *   - `session.message.content.updated`
 */
export function reduceSessionRunState(
  prev: SessionRunState,
  event: unknown,
): SessionRunState {
  const root = eventRecord(event);
  if (root === null) return prev;
  const type: unknown = root["type"];
  if (typeof type !== "string") return prev;
  const sessionID = eventSessionID(event);
  if (sessionID === null || sessionID !== prev.sessionID) return prev;
  const data = eventData(event);
  switch (type) {
    case "session.execution.started":
      return {
        status: "active",
        sessionID,
        assistantMessageID: null,
        retry: null,
        error: null,
      };
    case "session.message.content.updated": {
      // Content flowing means the turn is live. Either it recovered from a
      // retry (re)attempt or we (re)connected mid-stream; record the streaming
      // assistant id so the working indicator can retire once parts appear.
      const messageID = eventString(data, "messageID") ?? eventString(data, "messageId");
      return {
        status: "active",
        sessionID,
        assistantMessageID: messageID ?? prev.assistantMessageID,
        retry: null,
        error: null,
      };
    }
    case "session.execution.succeeded":
      return { status: "idle", sessionID, assistantMessageID: prev.assistantMessageID, retry: null, error: null };
    case "session.execution.interrupted":
      return { status: "interrupted", sessionID, assistantMessageID: prev.assistantMessageID, retry: null, error: null };
    case "session.execution.failed":
      return {
        status: "failed",
        sessionID,
        assistantMessageID: prev.assistantMessageID,
        retry: null,
        error: errorMessage(data),
      };
    case "session.retry.scheduled": {
      const attemptValue: unknown = data?.["attempt"];
      const attempt = typeof attemptValue === "number" && Number.isFinite(attemptValue) ? attemptValue : 1;
      const atValue: unknown = data?.["at"];
      const at = typeof atValue === "number" && Number.isFinite(atValue) ? atValue : null;
      return {
        status: "retry",
        sessionID,
        assistantMessageID: prev.assistantMessageID,
        retry: { attempt, at, message: errorMessage(data) ?? "" },
        error: null,
      };
    }
    default:
      return prev;
  }
}

interface RunEntry {
  state: SessionRunState;
  listeners: Set<SessionRunSubscriber>;
}

const runStates = new Map<string, RunEntry>();

function runKey(serverID: string, sessionID: string): string {
  return `${serverID}:${sessionID}`;
}

/** Fold one event into the stored run state and notify subscribers. */
function applyRunEvent(serverID: string, event: unknown): void {
  const sessionID = eventSessionID(event);
  if (sessionID === null) return;
  const key = runKey(serverID, sessionID);
  const entry = runStates.get(key);
  const prev = entry?.state ?? idleSessionRunState(sessionID);
  const next = reduceSessionRunState(prev, event);
  if (next === prev && entry !== undefined) return;
  if (entry === undefined) {
    runStates.set(key, { state: next, listeners: new Set() });
    return;
  }
  entry.state = next;
  for (const listener of [...entry.listeners]) {
    try {
      listener(next);
    } catch {
      // A faulty subscriber must not break state tracking.
    }
  }
}

/** Test-only helper: drop all tracked run state. */
export function resetSessionRunStatesForTests(): void {
  runStates.clear();
}

interface HubEntry {
  server: ServerConfig;
  fingerprint: string;
  listeners: Set<ServerEventListener>;
  controller: AbortController;
  started: boolean;
  backoffMs: number;
}

const hubs = new Map<string, HubEntry>();

/**
 * The password is sealed in the credential vault, so it cannot take part in
 * the fingerprint directly. Its revision counter changes whenever the
 * credential is written or removed, which is what the hub has to react to.
 */
function fingerprint(server: ServerConfig): string {
  return `${server.baseUrl} ${server.username} ${credentialRevision(server.id)}`;
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
        // Derive session run state before fan-out so subscribers see lifecycle
        // transitions even when no other listener cares about the event.
        applyRunEvent(entry.server.id, event);
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
    // Fresh connect: run state observed before a reconnect is stale, so reset
    // each tracked session of this server to `idle` and pick the new stream's
    // lifecycle from scratch. Listeners (and their entries) are preserved so a
    // subscriber that registered a moment before the stream opened keeps
    // receiving updates.
    for (const key of [...runStates.keys()]) {
      if (key === server.id || key.startsWith(`${server.id}:`)) {
        const runEntry = runStates.get(key);
        if (runEntry !== undefined) {
          runEntry.state = idleSessionRunState(runEntry.state.sessionID);
        }
      }
    }
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

/**
 * Subscribe to the derived run state of `server`'s `sessionID`. Delivers the
 * current state immediately (so a mount never misses where the run stands) and
 * re-delivers on every lifecycle transition. The underlying stream — and thus
 * the reducer — is driven by `subscribeServerEvents` subscribers (e.g. the
 * session messages hook); this only tracks and fans out state, it does not open
 * a stream of its own.
 */
export function subscribeServerRunState(
  server: ServerConfig,
  sessionID: string,
  listener: SessionRunSubscriber,
): () => void {
  const key = runKey(server.id, sessionID);
  let entry = runStates.get(key);
  if (entry === undefined) {
    entry = { state: idleSessionRunState(sessionID), listeners: new Set() };
    runStates.set(key, entry);
  }
  const active: RunEntry = entry;
  active.listeners.add(listener);
  listener(active.state);
  return () => {
    active.listeners.delete(listener);
  };
}

/** Test-only helper: how many server streams are currently running. */
export function activeEventHubCountForTests(): number {
  return hubs.size;
}
