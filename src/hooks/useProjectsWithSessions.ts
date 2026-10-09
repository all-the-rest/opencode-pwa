import { useCallback, useRef, useSyncExternalStore } from "react";
import { listSessionsPaged, type ServerConfig } from "../lib/opencode.ts";
import { sessionProjectKeys } from "../lib/projectTree.ts";
import { LIVE_REFRESH_INTERVAL_MS, useLiveRefresh } from "./useLiveRefresh.ts";

/**
 * How many session rows the "leere Projekte" probe asks for.
 *
 * The filter has to answer "does this project have a session at all", and a
 * cursor page cannot answer that: the server page's sessions card holds 50
 * rows, the sidebar's own list 15 — on a server with 1000+ sessions (the
 * owner's live one, and its cursor points at more) the first 50 rows touch a
 * handful of projects, while the same server's first 1000 rows cover 13
 * non-empty projects. Two different page sizes meant two different answers for
 * one rule, so the very same project could show up in the sidebar and be
 * hidden on the server page.
 *
 * Hence ONE wide request per server (not per view): both views read the same
 * set of project keys, so they can never disagree. 1000 is deliberately not
 * "everything" — a server can exceed it, and the probe then fails OPEN
 * (unknown ≠ empty) instead of hiding what it cannot see.
 */
export const SESSION_PROBE_LIMIT = 1000;

/** What the probe knows about the selected server. */
export interface ProjectsWithSessions {
  /** Project keys the probed rows point at — the filter signal. */
  sessionProjectIDs: ReadonlySet<string>;
  /**
   * True once a probe response resolved. Only from here on is an empty set the
   * truth; before that it is merely what is known (the unknown state).
   */
  loaded: boolean;
  /** True when the probe answered with an error. Nothing is hidden on it. */
  failed: boolean;
}

/** Shared empty set — the keys of a probe that resolved nothing. */
const NO_KEYS: ReadonlySet<string> = new Set<string>();

/**
 * The state before the first response resolved: nothing known, so nothing is
 * hidden. Unknown ≠ empty — a project may well have a session we cannot see
 * yet, and hiding it on a guess is exactly what this probe replaces.
 */
const UNKNOWN: ProjectsWithSessions = {
  sessionProjectIDs: NO_KEYS,
  loaded: false,
  failed: false,
};

interface ProbeEntry {
  /** Latest config of the server (a rename/auth change must not probe the old). */
  server: ServerConfig;
  /** Immutable snapshot — only replaced on a resolved probe, never mutated. */
  snapshot: ProjectsWithSessions;
  listeners: Set<() => void>;
  /** True while a request is running, so overlapping refreshes collapse into one. */
  inFlight: boolean;
}

/**
 * One entry per server id. Entries outlive their subscribers: a view that
 * comes back (server page → project page → server page) re-uses the last
 * answer instead of flashing an unfiltered list, and refreshes it in the
 * background.
 */
const probes = new Map<string, ProbeEntry>();

/** Replace the snapshot of one entry and wake every view that reads it. */
function publish(entry: ProbeEntry, snapshot: ProjectsWithSessions): void {
  entry.snapshot = snapshot;
  for (const listener of [...entry.listeners]) {
    try {
      listener();
    } catch {
      // A faulty subscriber must not stop the fan-out (same rule as the hub).
    }
  }
}

async function runProbe(entry: ProbeEntry): Promise<void> {
  // Two overlapping probes ask the same question; the one in flight wins.
  if (entry.inFlight) return;
  entry.inFlight = true;
  const result = await listSessionsPaged(entry.server, { limit: SESSION_PROBE_LIMIT });
  entry.inFlight = false;
  if (result.error !== null) {
    // Fail open: an unreachable server hides nothing.
    publish(entry, { sessionProjectIDs: NO_KEYS, loaded: false, failed: true });
    return;
  }
  if (result.data === null) {
    // A payload without rows is not "zero sessions" — it is nothing known.
    publish(entry, { sessionProjectIDs: NO_KEYS, loaded: false, failed: false });
    return;
  }
  publish(entry, {
    sessionProjectIDs: sessionProjectKeys(result.data.rows),
    loaded: true,
    failed: false,
  });
}

/** Register one view on the probe of `server`; returns the unsubscribe. */
function subscribeProbe(server: ServerConfig, listener: () => void): () => void {
  let entry = probes.get(server.id);
  if (entry === undefined) {
    entry = { server, snapshot: UNKNOWN, listeners: new Set(), inFlight: false };
    probes.set(server.id, entry);
  }
  const active: ProbeEntry = entry;
  active.server = server;
  active.listeners.add(listener);
  // A new subscriber starts (or joins) the request: the first view to arrive
  // pays for it, every other view reads the same answer.
  void runProbe(active);
  return () => {
    active.listeners.delete(listener);
  };
}

/** Snapshot of one server's probe, or the unknown state when there is none. */
function snapshotOf(serverID: string | null): ProjectsWithSessions {
  if (serverID === null) return UNKNOWN;
  return probes.get(serverID)?.snapshot ?? UNKNOWN;
}

/** Test-only helper: drop every probe entry and its last answer. */
export function resetProjectSessionProbesForTests(): void {
  probes.clear();
}

/**
 * The shared "has sessions" signal for the "leere Projekte" filter.
 *
 * Both views that hide zero-session projects — the server page's projects card
 * and the sidebar — read ONE probe per server (`SESSION_PROBE_LIMIT` rows,
 * reduced to project keys via `sessionProjectKeys`), so they can never
 * disagree about a project. The views keep their own session lists exactly as
 * they are; only the filter signal moved here.
 *
 * Fail open: while the probe is in flight or failed, `loaded` stays false and
 * a view that honours it hides nothing. Switching the selected server swaps the
 * entry, so the new server starts from "unknown" again until it answers.
 */
export function useProjectsWithSessions(server: ServerConfig | null): ProjectsWithSessions {
  const serverID = server === null ? null : server.id;
  // The subscribe callback reads the LATEST config through this ref: a
  // re-render (renamed server, new credential) never probes a stale entry.
  const serverRef = useRef(server);
  serverRef.current = server;

  // Keyed on the server id: React re-subscribes when this identity changes,
  // which is exactly the "selected server changed" moment. Keying on the
  // object itself would re-subscribe on every provider re-render.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const active = serverRef.current;
      if (active === null || serverID === null) return () => {};
      return subscribeProbe(active, onStoreChange);
    },
    [serverID],
  );
  const getSnapshot = useCallback(() => snapshotOf(serverID), [serverID]);
  const probe = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(() => {
    const active = serverRef.current;
    if (active === null) return;
    const entry = probes.get(active.id);
    if (entry !== undefined) void runProbe(entry);
  }, []);
  // Live on the same 5s/event-hub cadence the two views already use for their
  // own lists: a project whose first session just appeared (folder picker,
  // another tab) must not stay hidden until the next mount.
  useLiveRefresh(server, refresh, LIVE_REFRESH_INTERVAL_MS);

  return probe;
}
