import { useEffect, useState } from "react";
import {
  idleSessionRunState,
  subscribeServerRunState,
  type SessionRunState,
} from "../lib/eventHub.ts";
import type { ServerConfig } from "../lib/opencode.ts";

/**
 * Derived run state of one session (working / retry / interrupted / failed).
 *
 * The state machine lives in the event hub (durable across re- and mounts
 * within a connection); this hook only subscribes and mirrors it into React so
 * SessionDetail can render the live progress indicators. Defaults to `idle`
 * and resets whenever the server or session changes.
 */
export function useSessionRunState(
  server: ServerConfig | null | undefined,
  sessionID: string | undefined,
): SessionRunState {
  const [state, setState] = useState<SessionRunState>(() => idleSessionRunState(sessionID ?? ""));

  useEffect(() => {
    if (server === null || server === undefined || sessionID === undefined) {
      setState(idleSessionRunState(""));
      return;
    }
    const activeServer: ServerConfig = server;
    const activeSession: string = sessionID;
    return subscribeServerRunState(activeServer, activeSession, setState);
  }, [server, sessionID]);

  return state;
}
