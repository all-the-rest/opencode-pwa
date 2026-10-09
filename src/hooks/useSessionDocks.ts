import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  dockReducer,
  dropDockForm,
  dropDockPermission,
  setDockInboxDelivery,
  toDockInboxItem,
  toDockPermission,
  EMPTY_DOCK_STACK,
  type DockPermission,
  type DockRevert,
  type DockStackState,
} from "../lib/dockStack.ts";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import {
  listSessionForms,
  listSessionInbox,
  listSessionPermissions,
  type ServerConfig,
} from "../lib/opencode.ts";

/** Poll interval of the dock stack (mirrors the other live views). */
export const DOCK_REFRESH_INTERVAL_MS = 5000;

export interface SessionDocksValue {
  docks: DockStackState;
  /** A dock answer was sent (or a reload is in flight): buttons lock. */
  busy: boolean;
  /** Re-read permissions + forms + inbox of the open session. */
  reload: () => void;
  /** Drop one answered permission request (optimistic until the next reload). */
  answeredPermission: (id: string) => void;
  /** Drop one answered form (optimistic). */
  answeredForm: (id: string) => void;
  /** Change the planned delivery of one queued entry (optimistic). */
  deliveredInbox: (id: string, delivery: "steer" | "queue") => void;
  /** Called after staging/committing/discarding a revert. */
  reverted: (revert: DockRevert | null) => void;
}

function toDockRows(rows: readonly {
  id: string;
  action: string;
  resources: string[];
  message: string | null;
}[]): DockPermission[] {
  return rows.map((row) => toDockPermission(row, row.id));
}

function toInboxDockRows(
  rows: readonly { id: string; kind: string; summary: string; delivery: "steer" | "queue" | null }[],
) {
  return rows.map((row) =>
    toDockInboxItem(row.id, {
      type: row.kind,
      payload: { text: row.summary },
      delivery: row.delivery,
    }),
  );
}

/**
 * Everything the running session needs answered, as one live stack.
 *
 * The stack is loaded once per session (permissions + forms + inbox), folded
 * from the shared event stream (`permission.asked`/`permission.replied`,
 * `form.*`, `session.inbox.*`, `session.revert.*`) and re-synced on a slow poll
 * as a backstop for events the stream missed.
 */
export function useSessionDocks(
  server: ServerConfig | null | undefined,
  sessionID: string | undefined,
): SessionDocksValue {
  const [docks, dispatch] = useReducer(dockReducer, EMPTY_DOCK_STACK);
  const [busyCount, setBusyCount] = useState(0);

  const reload = useCallback(() => {
    if (server === null || server === undefined || sessionID === undefined) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = sessionID;
    setBusyCount((count) => count + 1);
    void Promise.all([
      listSessionPermissions(activeServer, activeSession),
      listSessionForms(activeServer, activeSession),
      listSessionInbox(activeServer, activeSession),
    ])
      .then(([permissions, forms, inbox]) => {
        if (permissions.data !== null) {
          dispatch({ type: "permissions", rows: toDockRows(permissions.data) });
        }
        if (forms.data !== null) {
          dispatch({
            type: "forms",
            rows: forms.data.map((row) => ({ id: row.id, title: row.title, fields: row.fields })),
          });
        }
        if (inbox.data !== null) {
          dispatch({ type: "inbox", rows: toInboxDockRows(inbox.data) });
        }
      })
      .finally(() => setBusyCount((count) => Math.max(0, count - 1)));
  }, [server, sessionID]);

  // The interval and the event subscription always call the latest `reload`.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (server === null || server === undefined || sessionID === undefined) {
      dispatch({ type: "reset", sessionID: "" });
      return;
    }
    const activeServer: ServerConfig = server;
    dispatch({ type: "reset", sessionID });
    reloadRef.current();
    const unsubscribe = subscribeServerEvents(activeServer, (event: unknown) => {
      dispatch({ type: "event", event });
    });
    // Backstop for events the stream missed (reconnects, silent periods).
    const timer = setInterval(() => {
      reloadRef.current();
    }, DOCK_REFRESH_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [server, sessionID]);

  return useMemo<SessionDocksValue>(
    () => ({
      docks,
      busy: busyCount > 0,
      reload,
      answeredPermission: (id: string) =>
        dispatch({ type: "permissions", rows: dropDockPermission(docks, id).permissions }),
      answeredForm: (id: string) => dispatch({ type: "forms", rows: dropDockForm(docks, id).forms }),
      deliveredInbox: (id: string, delivery: "steer" | "queue") =>
        dispatch({ type: "inbox", rows: setDockInboxDelivery(docks, id, delivery).inbox }),
      reverted: (revert: DockRevert | null) => dispatch({ type: "revert", revert }),
    }),
    [docks, busyCount, reload],
  );
}
