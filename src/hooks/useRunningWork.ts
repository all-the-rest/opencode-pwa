import { useCallback, useEffect, useRef, useState } from "react";
import { activeModelLabel } from "../lib/activeAgents.ts";
import {
  extractPtyRows,
  extractSessionRows,
  extractShellRows,
  getSessionInfo,
  isRunningShellStatus,
  listActiveSessionIDs,
  listPtys,
  listShells,
  listSessions,
  type ServerConfig,
} from "../lib/opencode.ts";

/** Poll cadence of the running strip (mirrors the dock stack's 5 s). */
export const RUNNING_WORK_REFRESH_MS = 5000;

/** One running shell of the open server. */
export interface RunningShell {
  id: string;
  command: string;
  startedAt: number | null;
}

/** One live PTY of the open server. */
export interface RunningPty {
  id: string;
  title: string | null;
  startedAt: number | null;
}

/** One other session of the open server with a live execution ("subagent"). */
export interface RunningAgent {
  serverID: string;
  sessionID: string;
  title: string;
  agent: string | null;
  model: string | null;
  projectKey: string | null;
  startedAt: number | null;
}

export interface RunningWork {
  shells: RunningShell[];
  ptys: RunningPty[];
  agents: RunningAgent[];
}

const EMPTY_WORK: RunningWork = { shells: [], ptys: [], agents: [] };

export interface UseRunningWorkOptions {
  /** The open session: its own run state is visible in the chat already. */
  currentSessionID?: string | null;
  /** False while the server is unreachable: keep the last rows, stop polling. */
  enabled?: boolean;
}

/**
 * Everything currently running on one server: shells (`shell.list`), PTYs
 * (`pty.list`) and the server's other live sessions (`session.active` joined
 * with `session.list`). Polled every {@link RUNNING_WORK_REFRESH_MS}; a failed
 * poll keeps the previous rows (a transient blip must not make running work
 * vanish), and session models are fetched once per session id.
 *
 * The open session is excluded from `agents` on purpose: its runtime is the
 * chat's own run state (working row, streaming text), and a row that navigates
 * to the session you are already in adds nothing.
 */
export function useRunningWork(
  server: ServerConfig | null | undefined,
  options: UseRunningWorkOptions = {},
): RunningWork {
  const currentSessionID = options.currentSessionID ?? null;
  const enabled = options.enabled ?? true;
  const [work, setWork] = useState<RunningWork>(EMPTY_WORK);
  // Models are stable per session: fetch them once, reuse on later polls.
  const knownModels = useRef<Record<string, string | null>>({});

  const load = useCallback(async () => {
    if (server === null || server === undefined) return;
    const [shellsRes, ptysRes, activeRes, sessionsRes] = await Promise.all([
      listShells(server),
      listPtys(server),
      listActiveSessionIDs(server),
      listSessions(server),
    ]);
    if (shellsRes.error === null && shellsRes.data !== null) {
      setWork((prev) => ({
        ...prev,
        shells: extractShellRows(shellsRes.data)
          .filter((row) => isRunningShellStatus(row.status))
          .map((row) => ({ id: row.id, command: row.command, startedAt: row.createdAt })),
      }));
    }
    if (ptysRes.error === null && ptysRes.data !== null) {
      setWork((prev) => ({
        ...prev,
        ptys: extractPtyRows(ptysRes.data).map((row) => ({
          id: row.id,
          title: row.title,
          startedAt: row.createdAt,
        })),
      }));
    }
    if (activeRes.error !== null || sessionsRes.error !== null) return;
    if (activeRes.data === null || sessionsRes.data === null) return;
    const rows = extractSessionRows(sessionsRes.data);
    const ids = activeRes.data.filter((id) => id !== currentSessionID);
    const models: Record<string, string | null> = { ...knownModels.current };
    await Promise.all(
      ids
        .filter((id) => models[id] === undefined)
        .map(async (id) => {
          const info = await getSessionInfo(server, id);
          models[id] = activeModelLabel(info.data?.model ?? null);
        }),
    );
    knownModels.current = models;
    setWork((prev) => ({
      ...prev,
      agents: ids.map((id) => {
        const row = rows.find((entry) => entry.id === id);
        return {
          serverID: server.id,
          sessionID: id,
          title: row?.label ?? id,
          agent: row?.agent ?? null,
          model: models[id] ?? null,
          projectKey: row?.projectKey ?? null,
          startedAt: row?.created ?? null,
        };
      }),
    }));
  }, [server, currentSessionID]);

  useEffect(() => {
    if (server === null || server === undefined || !enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), RUNNING_WORK_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [server, enabled, load]);

  // Leaving the session (or disabling the poll) must not resurrect stale rows.
  useEffect(() => {
    if (enabled) return;
    setWork(EMPTY_WORK);
  }, [enabled]);

  return work;
}
