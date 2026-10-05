/**
 * Offline-server behaviour (owner requirement): a server that stops answering
 * is NEVER removed from the list and never triggers a delete prompt. It stays
 * configured, its rows stay visible, but they are marked offline and every
 * action that needs a round-trip is disabled until the server answers again.
 *
 * Kept as a pure module so the policy is unit-testable without rendering.
 */

/** Every user-triggerable action against a server. */
export type ServerAction =
  | "session-interrupt"
  | "session-delete"
  | "sessions-load-more"
  | "shell-create"
  | "shell-remove"
  | "shell-output"
  | "pty-token";

/** Actions that need a live round-trip and are therefore disabled while offline. */
const ACTIONS_REQUIRING_SERVER: ReadonlySet<ServerAction> = new Set<ServerAction>([
  "session-interrupt",
  "session-delete",
  "sessions-load-more",
  "shell-create",
  "shell-remove",
  "shell-output",
  "pty-token",
]);

/**
 * `offline` is derived from the last load error, not from `navigator.onLine`:
 * a server behind a VPN or on the LAN is reachable while the browser reports
 * no connection, and vice versa.
 */
export function isActionEnabled(offline: boolean, action: ServerAction): boolean {
  return !(offline && ACTIONS_REQUIRING_SERVER.has(action));
}

/** Test seam: the full set of actions blocked while offline. */
export function blockedWhileOffline(): readonly ServerAction[] {
  return [...ACTIONS_REQUIRING_SERVER];
}

export interface ServerReachability {
  /** Server could not be reached (or answered with an error). */
  offline: boolean;
  /** Rows must render as disabled and carry the offline badge. */
  markRowsOffline: boolean;
}

/** Single source of truth for the offline state of one server page. */
export function reachability(error: string | null): ServerReachability {
  const offline = error !== null;
  return { offline, markRowsOffline: offline };
}
