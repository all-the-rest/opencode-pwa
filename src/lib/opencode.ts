import { t } from "@lingui/core/macro";
import { OpenCode } from "@opencode/client";

export interface ServerConfig {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
}

export type OpencodeClient = ReturnType<typeof OpenCode.make>;

export function basicAuthHeader(server: Pick<ServerConfig, "username" | "password">): string {
  return `Basic ${btoa(`${server.username}:${server.password}`)}`;
}

export function makeClient(server: ServerConfig): OpencodeClient {
  const headers: Record<string, string> = {};
  if (server.username !== "" || server.password !== "") {
    headers["Authorization"] = basicAuthHeader(server);
  }
  const normalizedBaseUrl = server.baseUrl.replace(/\/$/, "");
  return OpenCode.make({
    baseUrl: normalizedBaseUrl,
    headers,
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return t`Unbekannter Fehler`;
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

async function guarded<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: toErrorMessage(error) };
  }
}

export function getServerInfo(server: ServerConfig) {
  return guarded(() => makeClient(server).server.info());
}

export function listSessions(server: ServerConfig) {
  return guarded(() => makeClient(server).session.list());
}

export interface SessionListOptions {
  limit?: number;
  cursor?: string;
  project?: string;
  search?: string;
}

export interface SessionPage {
  rows: SessionRow[];
  cursor: { next: string | null; previous: string | null };
}

function readCursor(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Split a `session.list` payload into rows plus the paging cursor. */
export function extractSessionPage(value: unknown): SessionPage {
  const rows = extractSessionRows(value);
  let next: string | null = null;
  let previous: string | null = null;
  if (value !== null && typeof value === "object") {
    const cursor: unknown = (value as { cursor?: unknown }).cursor;
    if (cursor !== null && typeof cursor === "object") {
      const record = cursor as Record<string, unknown>;
      next = readCursor(record["next"]);
      previous = readCursor(record["previous"]);
    }
  }
  return { rows, cursor: { next, previous } };
}

/** Cursor-paged session list (server-side paging + optional project/search filter). */
export function listSessionsPaged(
  server: ServerConfig,
  options: SessionListOptions = {},
): Promise<ApiResult<SessionPage>> {
  return guarded(async () => {
    const payload = await makeClient(server).session.list({
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
      ...(options.project !== undefined ? { project: options.project } : {}),
      ...(options.search !== undefined ? { search: options.search } : {}),
    });
    return extractSessionPage(payload);
  });
}

export function listShells(server: ServerConfig) {
  // GET /api/shell
  return guarded(() => makeClient(server).shell.list());
}

export function listPtys(server: ServerConfig) {
  // GET /api/pty
  return guarded(() => makeClient(server).pty.list());
}

export function listAgents(server: ServerConfig) {
  return guarded(() => makeClient(server).agent.list());
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export const UNASSIGNED_PROJECT_KEY = "Ohne Projekt";

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

function toProjectInfo(entry: unknown, index: number): ProjectInfo {
  if (entry !== null && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    const id = readString(record, ["id"]) ?? `projekt-${index}`;
    const name = readString(record, ["name", "canonical"]) ?? id;
    return { id, name };
  }
  const fallback = `projekt-${index}`;
  return { id: fallback, name: String(entry) === "" ? fallback : String(entry) };
}

export function extractProjects(value: unknown): ProjectInfo[] {
  if (Array.isArray(value)) return value.map(toProjectInfo);
  if (value !== null && typeof value === "object") {
    const record = value as { data?: unknown };
    if (Array.isArray(record.data)) return record.data.map(toProjectInfo);
  }
  return [];
}

export function projectDisplayName(
  projects: ProjectInfo[],
  key: string | null,
): string {
  if (key === null) return UNASSIGNED_PROJECT_KEY;
  return projects.find((p) => p.id === key)?.name ?? key;
}

/** Raw project key of a session entry (`projectID` / `projectId` / `directory`), null when absent. */
export function sessionProjectKey(entry: unknown): string | null {
  if (entry === null || typeof entry !== "object") return null;
  return readString(entry as Record<string, unknown>, [
    "projectID",
    "projectId",
    "project_id",
    "directory",
  ]);
}

export interface SessionRow {
  id: string;
  label: string;
  projectKey: string | null;
  agent: string | null;
}

/** Raw agent of a session entry (`agent` / `agentID` / `agentId`), null when absent. */
export function sessionAgentKey(entry: unknown): string | null {
  if (entry === null || typeof entry !== "object") return null;
  return readString(entry as Record<string, unknown>, ["agent", "agentID", "agentId"]);
}

export function extractSessionRows(value: unknown): SessionRow[] {
  if (value === null || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.map((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const id = readString(record, ["id"]) ?? `eintrag-${index}`;
      const label =
        readString(record, ["title", "name", "command"]) ?? id;
      return {
        id,
        label,
        projectKey: sessionProjectKey(entry),
        agent: sessionAgentKey(entry),
      };
    }
    return { id: `eintrag-${index}`, label: String(entry), projectKey: null, agent: null };
  });
}

export interface SessionFilter {
  agent?: string | null;
  projectKey?: string | null;
  search?: string;
}

/** Client-side session filter (agent exact, project exact, search substring). */
export function filterSessionRows(rows: SessionRow[], filter: SessionFilter): SessionRow[] {
  const search = (filter.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.agent !== undefined && filter.agent !== null && filter.agent !== "") {
      if ((row.agent ?? "").toLowerCase() !== filter.agent.toLowerCase()) return false;
    }
    if (filter.projectKey !== undefined && filter.projectKey !== null && filter.projectKey !== "") {
      if (row.projectKey !== filter.projectKey) return false;
    }
    if (search !== "") {
      const haystack = `${row.label} ${row.id}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/** POST /api/session/{sessionID}/interrupt — stop the running execution. */
export function interruptSession(server: ServerConfig, sessionID: string) {
  return guarded(() => makeClient(server).session.interrupt({ sessionID }));
}

/** DELETE /api/session/{sessionID} — delete the session. */
export function removeSession(server: ServerConfig, sessionID: string) {
  return guarded(() => makeClient(server).session.remove({ sessionID }));
}

/** POST /api/session/{sessionID}/prompt — send a prompt (returns the inbox entry). */
export function sendPrompt(server: ServerConfig, sessionID: string, text: string) {
  return guarded(() => makeClient(server).session.prompt({ sessionID, text }));
}

/** DELETE /api/shell/{id} — remove (abort) a shell. */
export function removeShell(server: ServerConfig, id: string) {
  return guarded(() => makeClient(server).shell.remove({ id }));
}

export interface ShellOutput {
  output: string;
  cursor: number;
  truncated: boolean;
}

/** Normalize a `shell.output` payload (`{ data: { output, cursor, truncated } }`). */
export function extractShellOutput(value: unknown): ShellOutput | null {
  if (value === null || typeof value !== "object") return null;
  const data: unknown = (value as { data?: unknown }).data;
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record["output"] !== "string") return null;
  return {
    output: record["output"],
    cursor: typeof record["cursor"] === "number" ? record["cursor"] : 0,
    truncated: record["truncated"] === true,
  };
}

/** GET /api/shell/{id}/output — live shell output with cursor paging. */
export function getShellOutput(server: ServerConfig, id: string, cursor?: number) {
  return guarded(async () => {
    const payload = await makeClient(server).shell.output(
      cursor === undefined ? { id } : { id, cursor },
    );
    return extractShellOutput(payload);
  });
}

/** POST /api/shell — start a shell with the given command. */
export function createShell(server: ServerConfig, command: string) {
  return guarded(() => makeClient(server).shell.create({ command }));
}

/** GET /api/pty/{ptyID}/connect-token — ticket for attaching a terminal. */
export function getPtyConnectToken(server: ServerConfig, ptyID: string) {
  return guarded(() => makeClient(server).pty.connect.token({ ptyID }));
}

/** Pull the ticket string out of a `pty.connect.token` payload. */
export function extractPtyTicket(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const data: unknown = (value as { data?: unknown }).data;
  if (typeof data === "string" && data !== "") return data;
  if (data !== null && typeof data === "object") {
    return readString(data as Record<string, unknown>, ["ticket", "token"]);
  }
  return null;
}

export interface ProjectGroup {
  key: string;
  label: string;
  sessions: SessionRow[];
}

export function groupSessionsByProject(
  sessions: SessionRow[],
  projects: ProjectInfo[],
): ProjectGroup[] {
  const groups = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const key = session.projectKey ?? UNASSIGNED_PROJECT_KEY;
    const list = groups.get(key);
    if (list) list.push(session);
    else groups.set(key, [session]);
  }
  const knownOrder = new Map(projects.map((p, i) => [p.id, i]));
  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: projectDisplayName(projects, key === UNASSIGNED_PROJECT_KEY ? null : key),
      sessions: items,
    }))
    .sort((a, b) => {
      const orderA = knownOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const orderB = knownOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });
}

export function listProjects(server: ServerConfig): Promise<ApiResult<ProjectInfo[]>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `project.list()` exists
      // (node_modules/@opencode/client `project: { list, update }`).
      return extractProjects(await makeClient(server).project.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (server.username !== "" || server.password !== "") {
        headers["Authorization"] = basicAuthHeader(server);
      }
      const response = await fetch(`${baseUrl}/api/project`, { headers });
      if (!response.ok) {
        throw new Error(`GET /api/project failed with status ${response.status}`);
      }
      const body: unknown = await response.json();
      return extractProjects(body);
    }
  });
}

export function listMessages(server: ServerConfig, sessionID: string) {
  return guarded(() => makeClient(server).message.list({ sessionID }));
}

export async function* subscribeEvents(
  server: ServerConfig,
  signal: AbortSignal,
): AsyncGenerator<unknown, void, void> {
  const client = makeClient(server);
  const stream = client.event.subscribe({ signal });
  for await (const event of stream) {
    yield event;
  }
}
