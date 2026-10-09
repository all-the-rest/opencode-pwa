import { t } from "@lingui/core/macro";
import {
  extractSessionRows,
  getSessionInfo,
  listActiveSessionIDs,
  listSessions,
  type ServerConfig,
  type SessionRow,
} from "./opencode.ts";

/**
 * One live execution for the "Agenten" overview: which session on which
 * server is currently running, with what agent and model. `session.active()`
 * only reports IDs (`{ [sessionID]: { type: "running" } }`), so titles and
 * agents are joined from `session.list` and models best-effort from
 * `session.get` (a missing model never drops the row).
 */

export interface ActiveAgentRow {
  serverID: string;
  sessionID: string;
  title: string;
  agent: string | null;
  model: string | null;
  status: string;
  /** `time.created` of the session (ms) — anchor for the elapsed runtime. */
  startedAt: number | null;
  /** Project key of the session (desktop detail), null when unknown. */
  projectKey: string | null;
}

export function activeModelLabel(model: { id: string; providerID: string } | null): string | null {
  if (model === null) return null;
  return `${model.providerID}/${model.id}`;
}

/** Join active IDs with their list rows; unknown sessions keep their ID as title. */
export function joinActiveSessions(
  serverID: string,
  rows: SessionRow[],
  activeIDs: string[],
  models: Record<string, string | null>,
): ActiveAgentRow[] {
  return activeIDs.map((sessionID) => {
    const row = rows.find((entry) => entry.id === sessionID);
    return {
      serverID,
      sessionID,
      title: row?.label ?? sessionID,
      agent: row?.agent ?? null,
      model: models[sessionID] ?? null,
      status: "running",
      startedAt: row?.created ?? null,
      projectKey: row?.projectKey ?? null,
    };
  });
}

export interface ActiveAgentLoad {
  rows: ActiveAgentRow[];
  error: string | null;
}

/** Live executions of one server (active IDs + list join + best-effort models). */
export async function loadActiveAgents(server: ServerConfig): Promise<ActiveAgentLoad> {
  const [activeRes, sessionsRes] = await Promise.all([
    listActiveSessionIDs(server),
    listSessions(server),
  ]);
  const error = activeRes.error ?? sessionsRes.error;
  if (error !== null || activeRes.data === null) {
    return { rows: [], error: error ?? t`Aktive Sessions konnten nicht geladen werden.` };
  }
  const ids = activeRes.data;
  const rows = extractSessionRows(sessionsRes.data);
  const models: Record<string, string | null> = {};
  await Promise.all(
    ids.map(async (sessionID) => {
      const info = await getSessionInfo(server, sessionID);
      const model = info.data?.model ?? null;
      models[sessionID] = activeModelLabel(model);
    }),
  );
  return { rows: joinActiveSessions(server.id, rows, ids, models), error: null };
}
