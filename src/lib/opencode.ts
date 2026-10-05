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

/** GET /api/agent — normalized to `AgentOption[]` (see `extractAgents`). */
export function listAgents(server: ServerConfig): Promise<ApiResult<AgentOption[]>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `agent.list()` exists
      // (node_modules/@opencode/client `agent: { list, get }`).
      return extractAgents(await makeClient(server).agent.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const headers: Record<string, string> = { accept: "application/json" };
      if (server.username !== "" || server.password !== "") {
        headers["Authorization"] = basicAuthHeader(server);
      }
      const response = await fetch(`${baseUrl}/api/agent`, { headers });
      if (!response.ok) {
        throw new Error(`GET /api/agent failed with status ${response.status}`);
      }
      return extractAgents(await response.json());
    }
  });
}

export function listModels(server: ServerConfig): Promise<ApiResult<ModelOption[]>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `model.list()` exists
      // (node_modules/@opencode/client `model: { list, default }`).
      return extractModels(await makeClient(server).model.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const headers: Record<string, string> = { accept: "application/json" };
      if (server.username !== "" || server.password !== "") {
        headers["Authorization"] = basicAuthHeader(server);
      }
      const response = await fetch(`${baseUrl}/api/model`, { headers });
      if (!response.ok) {
        throw new Error(`GET /api/model failed with status ${response.status}`);
      }
      const body: unknown = await response.json();
      return extractModels(body);
    }
  });
}

export interface AgentOption {
  id: string;
  name: string;
  mode: string;
}

export interface ModelOption {
  /** Bare model id (used as `ModelRef.id` when switching). */
  id: string;
  providerID: string;
  name: string;
  variant?: string;
}

/**
 * Normalize an `agent.list` payload (`{ location, data: [...] }` or a plain
 * array). `hidden: true` agents are dropped — they are not offered for picking.
 */
export function extractAgents(value: unknown): AgentOption[] {
  const list = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  const options: AgentOption[] = [];
  list.forEach((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      if (record["hidden"] === true) return;
      const id = readString(record, ["id"]) ?? `agent-${index}`;
      options.push({
        id,
        name: readString(record, ["name"]) ?? id,
        mode: readString(record, ["mode"]) ?? "all",
      });
      return;
    }
    options.push({ id: `agent-${index}`, name: String(entry), mode: "all" });
  });
  return options;
}

/**
 * Normalize a `model.list` payload (`{ location, data: [...] }` or a plain
 * array). A model with `variants` becomes one option per variant, because the
 * variant is part of what `POST /api/session/{id}/model` needs.
 */
export function extractModels(value: unknown): ModelOption[] {
  const list = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  const options: ModelOption[] = [];
  list.forEach((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      options.push({ id: `modell-${index}`, providerID: "", name: String(entry) });
      return;
    }
    const record = entry as Record<string, unknown>;
    const providerID = readString(record, ["providerID", "providerId"]) ?? "";
    // `modelID` is the bare id that `ModelRef.id` expects; `id` may be
    // provider-qualified, so it is only the last resort.
    const id = readString(record, ["modelID", "modelId", "id"]) ?? `modell-${index}`;
    const name = readString(record, ["name", "canonical"]) ?? id;
    const single = readString(record, ["variant"]) ?? undefined;
    const variants = Array.isArray(record["variants"]) ? (record["variants"] as unknown[]) : [];
    if (variants.length === 0) {
      options.push({ id, providerID, name, ...(single !== undefined ? { variant: single } : {}) });
      return;
    }
    const expanded: ModelOption[] = [];
    for (const variant of variants) {
      const variantID =
        variant !== null && typeof variant === "object"
          ? readString(variant as Record<string, unknown>, ["id"])
          : null;
      if (variantID === null) continue;
      expanded.push({ id, providerID, name: `${name} (${variantID})`, variant: variantID });
    }
    // Never drop the model just because its variants were unusable.
    if (expanded.length === 0) {
      options.push({ id, providerID, name, ...(single !== undefined ? { variant: single } : {}) });
      return;
    }
    options.push(...expanded);
  });
  return options;
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

export interface SessionModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

/**
 * Stable `<select>` value for a model option. The bare `id` is ambiguous once a
 * model expands into one option per variant, so the variant joins the value.
 * Only the ref fields matter, so a current session model works without a name.
 */
export function modelOptionValue(model: Pick<ModelOption, "id" | "providerID" | "variant">): string {
  const base = `${model.providerID}/${model.id}`;
  return model.variant === undefined ? base : `${base}#${model.variant}`;
}

/** Inverse of `modelOptionValue`; `null` for a value this app never produced. */
export function parseModelOptionValue(value: string): SessionModelRef | null {
  const hash = value.indexOf("#");
  const head = hash === -1 ? value : value.slice(0, hash);
  const variant = hash === -1 ? undefined : value.slice(hash + 1);
  const slash = head.indexOf("/");
  if (slash === -1) return null;
  const providerID = head.slice(0, slash);
  const id = head.slice(slash + 1);
  if (providerID === "" || id === "") return null;
  return { id, providerID, ...(variant !== undefined && variant !== "" ? { variant } : {}) };
}

export interface SessionInfo {
  id: string;
  agent: string | null;
  model: SessionModelRef | null;
}

export function extractSessionInfo(value: unknown): SessionInfo | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const id = readString(data, ["id"]);
  if (id === null) return null;
  const agent = readString(data, ["agent"]);
  const modelRaw: unknown = data["model"];
  let model: SessionModelRef | null = null;
  if (modelRaw !== null && typeof modelRaw === "object") {
    const modelRecord = modelRaw as Record<string, unknown>;
    const modelID = readString(modelRecord, ["id", "modelID"]);
    const providerID = readString(modelRecord, ["providerID", "providerId"]);
    if (modelID !== null && providerID !== null) {
      const variant = readString(modelRecord, ["variant"]) ?? undefined;
      model = { id: modelID, providerID, ...(variant !== undefined ? { variant } : {}) };
    }
  }
  return { id, agent, model };
}

async function fetchSessionInfoRaw(server: ServerConfig, sessionID: string): Promise<unknown> {
  try {
    // Verified against the installed package: `session.get()` exists
    // (node_modules/@opencode/client `session: { ..., get, ... }`).
    return await makeClient(server).session.get({ sessionID });
  } catch {
    const baseUrl = server.baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { accept: "application/json" };
    if (server.username !== "" || server.password !== "") {
      headers["Authorization"] = basicAuthHeader(server);
    }
    const response = await fetch(
      `${baseUrl}/api/session/${encodeURIComponent(sessionID)}`,
      { headers },
    );
    if (!response.ok) {
      throw new Error(`GET /api/session/${sessionID} failed with status ${response.status}`);
    }
    return response.json();
  }
}

/** GET /api/session/{sessionID} — current agent/model of one session. */
export function getSessionInfo(server: ServerConfig, sessionID: string) {
  return guarded(async () => {
    const info = extractSessionInfo(await fetchSessionInfoRaw(server, sessionID));
    if (info === null) throw new Error(t`Unerwartete Session-Antwort vom Server.`);
    return info;
  });
}

/** POST /api/session/{sessionID}/agent — switch the session's agent. */
export function switchSessionAgent(server: ServerConfig, sessionID: string, agent: string) {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.switchAgent()` exists
      // (node_modules/@opencode/client `session: { ..., switchAgent, ... }`).
      await makeClient(server).session.switchAgent({ sessionID, agent });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (server.username !== "" || server.password !== "") {
        headers["Authorization"] = basicAuthHeader(server);
      }
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/agent`,
        { method: "POST", headers, body: JSON.stringify({ agent }) },
      );
      if (!response.ok) {
        throw new Error(`POST /api/session/${sessionID}/agent failed with status ${response.status}`);
      }
    }
  });
}

/** POST /api/session/{sessionID}/model — switch the session's model. */
export function switchSessionModel(
  server: ServerConfig,
  sessionID: string,
  model: SessionModelRef,
) {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.switchModel()` exists
      // (node_modules/@opencode/client `session: { ..., switchModel, ... }`).
      await makeClient(server).session.switchModel({ sessionID, model });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (server.username !== "" || server.password !== "") {
        headers["Authorization"] = basicAuthHeader(server);
      }
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/model`,
        { method: "POST", headers, body: JSON.stringify({ model }) },
      );
      if (!response.ok) {
        throw new Error(`POST /api/session/${sessionID}/model failed with status ${response.status}`);
      }
    }
  });
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
