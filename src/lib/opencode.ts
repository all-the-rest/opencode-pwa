import { t } from "@lingui/core/macro";
import { OpenCode } from "@opencode/client";
import { readCredential } from "./credentialVault.ts";

/**
 * A server as it is persisted (`localStorage`) and passed around the app:
 * identity and endpoint, never a secret. The password lives encrypted in the
 * credential vault and is resolved per request.
 */
export interface ServerConfig {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  /**
   * Per-server color (one of `SERVER_COLOR_PALETTE`). Optional so old entries
   * without a color keep parsing — they get the hash default via
   * `serverColor()` instead.
   */
  color?: string;
}

export interface ServerCredentials {
  username: string;
  password: string;
}

/** A {@link ServerConfig} with its password resolved from the vault. */
export type ResolvedServerConfig = ServerConfig & ServerCredentials;

export type OpencodeClient = ReturnType<typeof OpenCode.make>;

export function basicAuthHeader(credentials: ServerCredentials): string {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}

/** Open the password of `server` and return a config that can build a client. */
export async function getDecryptedConfig(server: ServerConfig): Promise<ResolvedServerConfig> {
  return { ...server, password: await readCredential(server.id) };
}

function authHeaders({ username, password }: ServerCredentials): Record<string, string> {
  return username !== "" || password !== ""
    ? { Authorization: basicAuthHeader({ username, password }) }
    : {};
}

function makeClientFor(resolved: ResolvedServerConfig): OpencodeClient {
  return OpenCode.make({
    baseUrl: resolved.baseUrl.replace(/\/$/, ""),
    headers: authHeaders(resolved),
  });
}

/**
 * Build an authenticated API client. Async because the password is sealed in
 * the credential vault and has to be opened first.
 */
export async function makeClient(server: ServerConfig): Promise<OpencodeClient> {
  return makeClientFor(await getDecryptedConfig(server));
}

/** Auth headers for the direct-fetch fallbacks (same credentials as the client). */
async function fetchAuthHeaders(server: ServerConfig): Promise<Record<string, string>> {
  return authHeaders(await getDecryptedConfig(server));
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
  return guarded(async () => (await makeClient(server)).server.info());
}

export function listSessions(server: ServerConfig) {
  return guarded(async () => (await makeClient(server)).session.list());
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
    const payload = await (await makeClient(server)).session.list({
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
  return guarded(async () => (await makeClient(server)).shell.list());
}

export function listPtys(server: ServerConfig) {
  // GET /api/pty
  return guarded(async () => (await makeClient(server)).pty.list());
}

/** GET /api/agent — normalized to `AgentOption[]` (see `extractAgents`). */
export function listAgents(server: ServerConfig): Promise<ApiResult<AgentOption[]>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `agent.list()` exists
      // (node_modules/@opencode/client `agent: { list, get }`).
      return extractAgents(await (await makeClient(server)).agent.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/agent`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
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
      return extractModels(await (await makeClient(server)).model.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/model`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
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
  /** Kept from `ModelInfo.capabilities` for read-only overviews (agent detail). */
  capabilities?: ModelCapabilities;
}

/** What a model can do (`ModelInfo.capabilities`): tool use + I/O formats. */
export interface ModelCapabilities {
  tools: boolean;
  input: string[];
  output: string[];
}

/** Normalize a `capabilities` payload; null when the entry carries none. */
export function extractModelCapabilities(value: unknown): ModelCapabilities | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record["tools"] !== "boolean") return null;
  const input = record["input"];
  const output = record["output"];
  return {
    tools: record["tools"],
    input: Array.isArray(input) ? input.filter((e): e is string => typeof e === "string") : [],
    output: Array.isArray(output) ? output.filter((e): e is string => typeof e === "string") : [],
  };
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
    const capabilities = extractModelCapabilities(record["capabilities"]) ?? undefined;
    const extra: { variant?: string; capabilities?: ModelCapabilities } = {
      ...(single !== undefined ? { variant: single } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
    };
    const variants = Array.isArray(record["variants"]) ? (record["variants"] as unknown[]) : [];
    if (variants.length === 0) {
      options.push({ id, providerID, name, ...extra });
      return;
    }
    const expanded: ModelOption[] = [];
    for (const variant of variants) {
      const variantID =
        variant !== null && typeof variant === "object"
          ? readString(variant as Record<string, unknown>, ["id"])
          : null;
      if (variantID === null) continue;
      expanded.push({ id, providerID, name: `${name} (${variantID})`, ...extra, variant: variantID });
    }
    // Never drop the model just because its variants were unusable.
    if (expanded.length === 0) {
      options.push({ id, providerID, name, ...extra });
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

/**
 * Display title of a session (mirrors the upstream web UI's `sessionTitle`):
 * generated placeholders (`New session - <ISO timestamp>`,
 * `Child session - …`) are stripped and empty titles fall back to the session
 * id — the label is never blank and never a raw placeholder.
 */
const GENERATED_TITLE_PATTERNS: readonly RegExp[] = [
  /^new session(?:\s+-\s+.*)?$/i,
  /^child session(?:\s+-\s+.*)?$/i,
];

export function sessionTitle(title: string | null | undefined, fallbackID: string): string {
  const trimmed = (title ?? "").trim();
  if (trimmed === "") return fallbackID;
  if (GENERATED_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed))) return fallbackID;
  return trimmed;
}

/**
 * A `session.renamed` V2 event carrying `{ sessionID, title }`, null for
 * anything else. Used to retitle open tabs live (not just on mount).
 */
export function extractSessionRename(event: unknown): { sessionID: string; title: string } | null {
  if (event === null || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;
  if (record["type"] !== "session.renamed") return null;
  const data: unknown = record["data"];
  if (data === null || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  const sessionID: unknown = dataRecord["sessionID"];
  const title: unknown = dataRecord["title"];
  if (typeof sessionID !== "string" || sessionID === "") return null;
  if (typeof title !== "string" || title === "") return null;
  return { sessionID, title };
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
      const label = sessionTitle(readString(record, ["title", "name", "command"]), id);
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
  return guarded(async () => (await makeClient(server)).session.interrupt({ sessionID }));
}

/** DELETE /api/session/{sessionID} — delete the session. */
export function removeSession(server: ServerConfig, sessionID: string) {
  return guarded(async () => (await makeClient(server)).session.remove({ sessionID }));
}

/** One workspace file attached to a prompt (`SessionPromptInput.files`). */
export interface PromptFileAttachment {
  uri: string;
  name?: string;
}

/**
 * Build a `files[].uri` for a workspace path. The API takes URIs, so a bare
 * project-relative path becomes `file:///...`; anything already shaped like a
 * URI passes through untouched.
 */
export function toPromptFileUri(path: string): string {
  const trimmed = path.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

/** POST /api/session/{sessionID}/prompt — send a prompt (returns the inbox entry). */
export function sendPrompt(
  server: ServerConfig,
  sessionID: string,
  text: string,
  files: PromptFileAttachment[] = [],
) {
  return guarded(async () => {
    const input =
      files.length > 0 ? { sessionID, text, files } : { sessionID, text };
    try {
      // Verified against the installed package: `session.prompt()` accepts
      // `files` (node_modules/@opencode/client `SessionPromptInput.files`).
      return await (await makeClient(server)).session.prompt(input);
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/prompt`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/session/${sessionID}/prompt failed with status ${response.status}`,
        );
      }
      return response.json();
    }
  });
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
  /** Per-session token usage (`session.get` carries it on `SessionInfo`). */
  tokens: TokenUsage | null;
  /** Per-session cost in USD (`SessionInfo.cost`), null when absent. */
  cost: number | null;
}

/** Token counters as the server reports them (`TokenUsageInfo`). */
export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Normalize a `TokenUsageInfo` payload; null when no counters exist. */
export function extractTokenUsage(value: unknown): TokenUsage | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const input = record["input"];
  const output = record["output"];
  if (typeof input !== "number" || typeof output !== "number") return null;
  const reasoning = record["reasoning"];
  const cache = record["cache"];
  const cacheRecord =
    cache !== null && typeof cache === "object" ? (cache as Record<string, unknown>) : null;
  const cacheRead = cacheRecord?.["read"];
  const cacheWrite = cacheRecord?.["write"];
  return {
    input,
    output,
    reasoning: typeof reasoning === "number" ? reasoning : 0,
    cacheRead: typeof cacheRead === "number" ? cacheRead : 0,
    cacheWrite: typeof cacheWrite === "number" ? cacheWrite : 0,
  };
}

function readCost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  return { id, agent, model, tokens: extractTokenUsage(data["tokens"]), cost: readCost(data["cost"]) };
}

async function fetchSessionInfoRaw(server: ServerConfig, sessionID: string): Promise<unknown> {
  try {
    // Verified against the installed package: `session.get()` exists
    // (node_modules/@opencode/client `session: { ..., get, ... }`).
    return await (await makeClient(server)).session.get({ sessionID });
  } catch {
    const baseUrl = server.baseUrl.replace(/\/$/, "");
    const response = await fetch(
      `${baseUrl}/api/session/${encodeURIComponent(sessionID)}`,
      { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
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

/**
 * IDs of sessions with a live execution (`{ [sessionID]: { type: "running" } }`).
 * Accepts the raw map, a `{ data }` envelope or a plain string array so
 * defensive mocks keep working; anything else yields no IDs.
 */
export function extractActiveSessionIDs(value: unknown): string[] {
  let source: Record<string, unknown> | null = null;
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const data: unknown = record["data"];
    if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      source = data as Record<string, unknown>;
    } else {
      source = record;
    }
  }
  if (source === null) return [];
  return Object.keys(source).filter(
    (key) => key !== "" && source[key] !== null && source[key] !== undefined,
  );
}

async function fetchActiveSessionIDsRaw(server: ServerConfig): Promise<unknown> {
  try {
    // Verified against the installed package: `session.active()` exists and
    // resolves `{ [sessionID]: SessionActive }` (GET /api/session/active).
    return await (await makeClient(server)).session.active();
  } catch {
    const baseUrl = server.baseUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/session/active`, {
      headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
    });
    if (!response.ok) {
      throw new Error(`GET /api/session/active failed with status ${response.status}`);
    }
    return response.json();
  }
}

/** GET /api/session/active — IDs of sessions with a live execution. */
export function listActiveSessionIDs(server: ServerConfig) {
  return guarded(async () => extractActiveSessionIDs(await fetchActiveSessionIDsRaw(server)));
}

/** PATCH /api/session/{sessionID} — rename the session. Verified against the
 * installed client (`session.update`, 204, `{ title }` body); direct-fetch
 * fallback uses the same method, path and body. */
export function renameSession(server: ServerConfig, sessionID: string, title: string) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.update({ sessionID, title });
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(await fetchAuthHeaders(server)),
          },
          body: JSON.stringify({ title }),
        },
      );
      if (!response.ok) {
        throw new Error(`PATCH /api/session/${sessionID} failed with status ${response.status}`);
      }
    }
  });
}

/** POST /api/session/{sessionID}/agent — switch the session's agent. */
export function switchSessionAgent(server: ServerConfig, sessionID: string, agent: string) {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.switchAgent()` exists
      // (node_modules/@opencode/client `session: { ..., switchAgent, ... }`).
      await (await makeClient(server)).session.switchAgent({ sessionID, agent });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/agent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ agent }),
        },
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
      await (await makeClient(server)).session.switchModel({ sessionID, model });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/model`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ model }),
        },
      );
      if (!response.ok) {
        throw new Error(`POST /api/session/${sessionID}/model failed with status ${response.status}`);
      }
    }
  });
}

/** DELETE /api/shell/{id} — remove (abort) a shell. */
export function removeShell(server: ServerConfig, id: string) {
  return guarded(async () => (await makeClient(server)).shell.remove({ id }));
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
    const payload = await (await makeClient(server)).shell.output(
      cursor === undefined ? { id } : { id, cursor },
    );
    return extractShellOutput(payload);
  });
}

/** POST /api/shell — start a shell with the given command. */
export function createShell(server: ServerConfig, command: string) {
  return guarded(async () => (await makeClient(server)).shell.create({ command }));
}

/** GET /api/pty/{ptyID}/connect-token — ticket for attaching a terminal. */
export function getPtyConnectToken(server: ServerConfig, ptyID: string) {
  return guarded(async () => (await makeClient(server)).pty.connect.token({ ptyID }));
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
      return extractProjects(await (await makeClient(server)).project.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/project`, {
        headers: await fetchAuthHeaders(server),
      });
      if (!response.ok) {
        throw new Error(`GET /api/project failed with status ${response.status}`);
      }
      const body: unknown = await response.json();
      return extractProjects(body);
    }
  });
}

export function listMessages(server: ServerConfig, sessionID: string) {
  return guarded(async () => (await makeClient(server)).message.list({ sessionID }));
}

/**
 * PATCH /api/project/{projectID} — rename a project.
 *
 * Verified against the installed package: `project.update()` exists
 * (node_modules/@opencode/client `project: { list, update }`) and hits
 * `PATCH /api/project/{projectID}` with `{ name }` in the body.
 * The direct-fetch fallback pins the same method/path/body.
 */
export function updateProjectName(
  server: ServerConfig,
  projectID: string,
  name: string,
): Promise<ApiResult<ProjectInfo>> {
  return guarded(async () => {
    try {
      return toProjectInfo(
        await (await makeClient(server)).project.update({ projectID, name }),
        0,
      );
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/project/${encodeURIComponent(projectID)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ name }),
        },
      );
      if (!response.ok) {
        throw new Error(`PATCH /api/project/${projectID} failed with status ${response.status}`);
      }
      return toProjectInfo(await response.json(), 0);
    }
  });
}

export async function* subscribeEvents(
  server: ServerConfig,
  signal: AbortSignal,
): AsyncGenerator<unknown, void, void> {
  const client = await makeClient(server);
  const stream = client.event.subscribe({ signal });
  for await (const event of stream) {
    yield event;
  }
}

// ---------------------------------------------------------------------------
// Parity: files, VCS, worktrees, MCP servers, permissions
//
// All read-only except the permission reply. Row extraction follows the same
// envelope-tolerant pattern as the rest of this module (`{ data: [...] }` or
// a plain array), because the client returns list endpoints verbatim.
// ---------------------------------------------------------------------------

/** Rows of a list endpoint, tolerating both `{ data: [...] }` and a plain array. */
export function extractListRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === "object") {
    const data: unknown = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

export interface FileEntryRow {
  path: string;
  type: "file" | "directory";
}

/** Normalize a `file.list` payload into browsable entries. */
export function extractFileEntries(value: unknown): FileEntryRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const path = readString(record, ["path", "name"]) ?? `eintrag-${index}`;
      return { path, type: record["type"] === "directory" ? "directory" : "file" };
    }
    return { path: String(entry), type: "file" };
  });
}

/** GET /api/fs/list — directory listing of one server. Read-only. */
export function listFiles(server: ServerConfig, path?: string): Promise<ApiResult<FileEntryRow[]>> {
  return guarded(async () =>
    extractFileEntries(
      await (await makeClient(server)).file.list(path === undefined ? {} : { path }),
    ),
  );
}

/** Longest file preview kept in the DOM; longer content is cut and flagged. */
export const MAX_FILE_PREVIEW_CHARS = 200_000;

export interface FileContent {
  text: string;
  truncated: boolean;
}

/** Decode the binary `file.read` payload into a bounded text preview. */
export function decodeFileContent(bytes: Uint8Array): FileContent {
  const decoded = new TextDecoder().decode(bytes);
  if (decoded.length <= MAX_FILE_PREVIEW_CHARS) {
    return { text: decoded, truncated: false };
  }
  return { text: decoded.slice(0, MAX_FILE_PREVIEW_CHARS), truncated: true };
}

/** GET /api/fs/read/{path} — file content, read-only. */
export function readFile(server: ServerConfig, path: string): Promise<ApiResult<FileContent>> {
  return guarded(async () => decodeFileContent(await (await makeClient(server)).file.read({ path })));
}

export type VcsChangeKind = "added" | "deleted" | "modified";

export interface VcsStatusRow {
  file: string;
  status: VcsChangeKind;
  additions: number;
  deletions: number;
}

/** Normalize a `vcs.status` payload into changed-file rows. */
export function extractVcsStatus(value: unknown): VcsStatusRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const raw = readString(record, ["status"]);
      const status: VcsChangeKind =
        raw === "added" || raw === "deleted" || raw === "modified" ? raw : "modified";
      const additions = record["additions"];
      const deletions = record["deletions"];
      return {
        file: readString(record, ["file", "path", "name"]) ?? `datei-${index}`,
        status,
        additions: typeof additions === "number" ? additions : 0,
        deletions: typeof deletions === "number" ? deletions : 0,
      };
    }
    return { file: String(entry), status: "modified", additions: 0, deletions: 0 };
  });
}

/** GET /api/vcs/status — working-tree changes of the server location. */
export function listVcsStatus(server: ServerConfig): Promise<ApiResult<VcsStatusRow[]>> {
  return guarded(async () => extractVcsStatus(await (await makeClient(server)).vcs.status()));
}

export interface WorktreeRow {
  directory: string;
  strategy: string | null;
}

/** Normalize a `worktree.list` payload into worktree rows. */
export function extractWorktrees(value: unknown): WorktreeRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      return {
        directory: readString(record, ["directory", "path", "name"]) ?? `worktree-${index}`,
        strategy: readString(record, ["strategy"]),
      };
    }
    return { directory: String(entry), strategy: null };
  });
}

/** GET /api/worktree?projectID= — worktrees of one project. Read-only. */
export function listWorktrees(
  server: ServerConfig,
  projectID: string,
): Promise<ApiResult<WorktreeRow[]>> {
  return guarded(async () =>
    extractWorktrees(await (await makeClient(server)).worktree.list({ projectID })),
  );
}

export type McpServerState =
  | "connected"
  | "pending"
  | "disabled"
  | "failed"
  | "needs_auth";

export interface McpServerRow {
  name: string;
  status: McpServerState;
  error: string | null;
}

const MCP_STATES: readonly McpServerState[] = [
  "connected",
  "pending",
  "disabled",
  "failed",
  "needs_auth",
];

function toMcpState(value: unknown): McpServerState {
  return MCP_STATES.includes(value as McpServerState) ? (value as McpServerState) : "pending";
}

/** Normalize an `mcp.list` payload (`status` is a nested object). */
export function extractMcpServers(value: unknown): McpServerRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return { name: String(entry), status: "pending", error: null };
    }
    const record = entry as Record<string, unknown>;
    const statusRaw: unknown = record["status"];
    const statusRecord =
      statusRaw !== null && typeof statusRaw === "object"
        ? (statusRaw as Record<string, unknown>)
        : null;
    return {
      name: readString(record, ["name", "server", "id"]) ?? `mcp-${index}`,
      status: toMcpState(statusRecord === null ? statusRaw : statusRecord["status"]),
      error: statusRecord === null ? null : readString(statusRecord, ["error", "message"]),
    };
  });
}

/** GET /api/mcp — configured MCP servers with their connection state. */
export function listMcpServers(server: ServerConfig): Promise<ApiResult<McpServerRow[]>> {
  return guarded(async () => extractMcpServers(await (await makeClient(server)).mcp.list()));
}

export interface PermissionRequestRow {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  message: string | null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** Normalize a `permission.request.list` payload into pending requests. */
export function extractPermissionRequests(value: unknown): PermissionRequestRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return { id: `anfrage-${index}`, sessionID: "", action: String(entry), resources: [], message: null };
    }
    const record = entry as Record<string, unknown>;
    return {
      id: readString(record, ["id", "requestID"]) ?? `anfrage-${index}`,
      sessionID: readString(record, ["sessionID", "sessionId"]) ?? "",
      action: readString(record, ["action", "type", "title"]) ?? "unbekannt",
      resources: toStringList(record["resources"]),
      message: readString(record, ["message", "title"]),
    };
  });
}

/** GET /api/permission/request — permission requests waiting for a decision. */
export function listPendingPermissions(
  server: ServerConfig,
): Promise<ApiResult<PermissionRequestRow[]>> {
  return guarded(async () =>
    extractPermissionRequests(await (await makeClient(server)).permission.request.list()),
  );
}

/** Answer of the server's question: allow once, allow permanently, deny. */
export type PermissionReplyDecision = "once" | "always" | "reject";

/**
 * POST /api/session/{sessionID}/permission/{requestID}/reply — answer one
 * pending permission request.
 */
export function replyPermission(
  server: ServerConfig,
  request: PermissionRequestRow,
  decision: PermissionReplyDecision,
): Promise<ApiResult<boolean>> {
  return guarded(async () => {
    if (request.sessionID === "") {
      throw new Error(t`Diese Berechtigungsanfrage hat keine Session und kann nicht beantwortet werden.`);
    }
    await (await makeClient(server)).permission.reply({
      sessionID: request.sessionID,
      requestID: request.id,
      decision,
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Parity batch 2: session stats, diff, fork/compact, agent detail, providers
//
// The REST paths below are verified against the installed package
// (`node_modules/@opencode/client`): `session.stats` hits
// `/api/experimental/session/stats`, `session.diff` hits
// `/api/session/{id}/diff`, `session.fork` hits `/api/session/{id}/fork`,
// `session.compact` hits `/api/session/{id}/compact`, `agent.get` hits
// `/api/agent/{agentID}` and `provider.list` hits `/api/provider`.
// Every call keeps the direct-fetch fallback, because the client throws on an
// unreachable server before any HTTP status exists.
//
// Note on `session.stats`: it is a *global* aggregate (all sessions, optional
// from/to/project/timezone filter) — there is no per-session stats endpoint.
// The per-session card on SessionDetail therefore reads tokens/cost from
// `session.get` (`SessionInfo.tokens`, `SessionInfo.cost`) and only takes the
// tool totals from the global stats call, labelled as such.
// ---------------------------------------------------------------------------

/** Global usage aggregate (`SessionStatsInfo`), normalized for the stats card. */
export interface SessionStatsSummary {
  sessions: number;
  prompts: number;
  steps: number;
  tokens: TokenUsage;
  cost: number;
  /** Tool calls across all sessions; null when the server sent no tool totals. */
  toolCalls: number | null;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Normalize a `session.stats` payload (`SessionStatsInfo`, possibly enveloped). */
export function extractSessionStats(value: unknown): SessionStatsSummary | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  if (typeof data["prompts"] !== "number" && typeof data["sessions"] !== "number") return null;
  let toolCalls: number | null = null;
  const tools = data["tools"];
  if (tools !== null && typeof tools === "object") {
    const totals = (tools as Record<string, unknown>)["totals"];
    if (totals !== null && typeof totals === "object") {
      const calls = (totals as Record<string, unknown>)["calls"];
      if (typeof calls === "number") toolCalls = calls;
    }
  }
  return {
    sessions: readCount(data["sessions"]),
    prompts: readCount(data["prompts"]),
    steps: readCount(data["steps"]),
    tokens: extractTokenUsage(data["tokens"]) ?? {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    cost: readCost(data["cost"]) ?? 0,
    toolCalls,
  };
}

/** GET /api/experimental/session/stats — global usage aggregate. */
export function getSessionStats(server: ServerConfig): Promise<ApiResult<SessionStatsSummary>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.stats()` exists
      // (node_modules/@opencode/client `session: { ..., stats, ... }`).
      const stats = extractSessionStats(await (await makeClient(server)).session.stats());
      if (stats === null) throw new Error(t`Unerwartete Statistik-Antwort vom Server.`);
      return stats;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Statistik")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/experimental/session/stats`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/experimental/session/stats failed with status ${response.status}`);
      }
      const stats = extractSessionStats(await response.json());
      if (stats === null) throw new Error(t`Unerwartete Statistik-Antwort vom Server.`);
      return stats;
    }
  });
}

export interface SessionDiffRow {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status: "added" | "deleted" | "modified";
}

/** Normalize a `session.diff` payload (`FileDiffInfo[]`, possibly enveloped). */
export function extractSessionDiff(value: unknown): SessionDiffRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return { file: String(entry), patch: "", additions: 0, deletions: 0, status: "modified" as const };
    }
    const record = entry as Record<string, unknown>;
    const raw = readString(record, ["status"]);
    const status: SessionDiffRow["status"] =
      raw === "added" || raw === "deleted" || raw === "modified" ? raw : "modified";
    const patch = record["patch"];
    const additions = record["additions"];
    const deletions = record["deletions"];
    return {
      file: readString(record, ["file", "path", "name"]) ?? `datei-${index}`,
      patch: typeof patch === "string" ? patch : "",
      additions: typeof additions === "number" ? additions : 0,
      deletions: typeof deletions === "number" ? deletions : 0,
      status,
    };
  });
}

/** GET /api/session/{sessionID}/diff — file diffs of one session, read-only. */
export function getSessionDiff(
  server: ServerConfig,
  sessionID: string,
): Promise<ApiResult<SessionDiffRow[]>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.diff()` exists
      // (node_modules/@opencode/client `session: { ..., diff, ... }`).
      return extractSessionDiff(await (await makeClient(server)).session.diff({ sessionID }));
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/diff`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(`GET /api/session/${sessionID}/diff failed with status ${response.status}`);
      }
      return extractSessionDiff(await response.json());
    }
  });
}

/** POST /api/session/{sessionID}/fork — fork the session, returns the new one. */
export function forkSession(
  server: ServerConfig,
  sessionID: string,
): Promise<ApiResult<SessionInfo>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.fork()` exists
      // (node_modules/@opencode/client `session: { ..., fork, ... }`).
      const info = extractSessionInfo(await (await makeClient(server)).session.fork({ sessionID }));
      if (info === null) throw new Error(t`Unerwartete Session-Antwort vom Server.`);
      return info;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Session")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/fork`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) {
        throw new Error(`POST /api/session/${sessionID}/fork failed with status ${response.status}`);
      }
      const info = extractSessionInfo(await response.json());
      if (info === null) throw new Error(t`Unerwartete Session-Antwort vom Server.`);
      return info;
    }
  });
}

/** POST /api/session/{sessionID}/compact — compact the session context. */
export function compactSession(server: ServerConfig, sessionID: string) {
  return guarded(async () => {
    try {
      // Verified against the installed package: `session.compact()` exists
      // (node_modules/@opencode/client `session: { ..., compact, ... }`).
      await (await makeClient(server)).session.compact({ sessionID });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/compact`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/session/${sessionID}/compact failed with status ${response.status}`,
        );
      }
    }
  });
}

/** One agent in full (`AgentInfo`): identity, model ref and behaviour flags. */
export interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  mode: string;
  model: SessionModelRef | null;
}

/** Normalize an `agent.get` payload (`{ location, data: AgentInfo }`). */
export function extractAgentDetail(value: unknown): AgentDetail | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const id = readString(data, ["id"]);
  if (id === null) return null;
  let model: SessionModelRef | null = null;
  const modelRaw: unknown = data["model"];
  if (modelRaw !== null && typeof modelRaw === "object") {
    const modelRecord = modelRaw as Record<string, unknown>;
    const modelID = readString(modelRecord, ["id", "modelID"]);
    const providerID = readString(modelRecord, ["providerID", "providerId"]);
    if (modelID !== null && providerID !== null) {
      const variant = readString(modelRecord, ["variant"]) ?? undefined;
      model = { id: modelID, providerID, ...(variant !== undefined ? { variant } : {}) };
    }
  }
  return {
    id,
    name: readString(data, ["name"]) ?? id,
    description: readString(data, ["description"]),
    mode: readString(data, ["mode"]) ?? "all",
    model,
  };
}

/** GET /api/agent/{agentID} — full detail of one agent. */
export function getAgentDetail(
  server: ServerConfig,
  agentID: string,
): Promise<ApiResult<AgentDetail>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `agent.get()` exists
      // (node_modules/@opencode/client `agent: { list, get }`).
      const detail = extractAgentDetail(
        await (await makeClient(server)).agent.get({ agentID }),
      );
      if (detail === null) throw new Error(t`Unerwartete Agent-Antwort vom Server.`);
      return detail;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Agent")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/agent/${encodeURIComponent(agentID)}`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/agent/${agentID} failed with status ${response.status}`);
      }
      const detail = extractAgentDetail(await response.json());
      if (detail === null) throw new Error(t`Unerwartete Agent-Antwort vom Server.`);
      return detail;
    }
  });
}

export interface ProviderRow {
  id: string;
  name: string;
  /** `activation` as reported (`auto`/`enabled`/`disabled`), raw otherwise. */
  activation: string;
}

/** Normalize a `provider.list` payload (`{ location, data: [...] }`). */
export function extractProviders(value: unknown): ProviderRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      const fallback = `anbieter-${index}`;
      return { id: fallback, name: String(entry) === "" ? fallback : String(entry), activation: "auto" };
    }
    const record = entry as Record<string, unknown>;
    const id = readString(record, ["id"]) ?? `anbieter-${index}`;
    return {
      id,
      name: readString(record, ["name", "canonical"]) ?? id,
      activation: readString(record, ["activation"]) ?? "auto",
    };
  });
}

/** GET /api/provider — configured providers, read-only. */
export function listProviders(server: ServerConfig): Promise<ApiResult<ProviderRow[]>> {
  return guarded(async () => {
    try {
      // Verified against the installed package: `provider.list()` exists
      // (node_modules/@opencode/client `provider: { list, get }`).
      return extractProviders(await (await makeClient(server)).provider.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/provider`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/provider failed with status ${response.status}`);
      }
      return extractProviders(await response.json());
    }
  });
}

// ---------------------------------------------------------------------------
// Parity batch 3: revert, share/export-import, commands/skills, websearch,
// session inbox, session forms
//
// REST paths verified against the installed package
// (`node_modules/@opencode/client`, chunk `service-version-*`):
// - `session.revert.stage` → POST /api/session/{id}/revert/stage {messageID}
// - `session.revert.clear` → DELETE /api/session/{id}/revert
// - `session.revert.commit` → POST /api/session/{id}/revert/commit
// - `session.export` → GET /api/experimental/session/{id}/export (?sanitize=)
// - `session.import` → POST /api/experimental/session/import {info, messages}
// - `command.list` → GET /api/command, `skill.list` → GET /api/skill
// - `session.command` → POST /api/session/{id}/command {name, text}
// - `websearch.providers` → GET /api/websearch/provider
// - `websearch.query` → POST /api/websearch {query, providerID}
// - `session.inbox.list` → GET /api/session/{id}/inbox
// - `session.inbox.cancel` → DELETE /api/session/{id}/inbox/{inboxID}
// - `session.inbox.update` → PATCH /api/session/{id}/inbox/{inboxID} {delivery}
// - `session.form.list` → GET /api/session/{id}/form
// - `session.form.reply` → POST /api/session/{id}/form/{formID}/reply {answer}
// - `session.form.cancel` → DELETE /api/session/{id}/form/{formID} (?message=)
//
// Every call keeps the direct-fetch fallback, because the client throws on an
// unreachable server before any HTTP status exists.
// ---------------------------------------------------------------------------

/** A staged revert (`SessionRevert`): which message the reset would return to. */
export interface SessionRevertInfo {
  messageID: string;
  /** Files the revert would touch, null when the server sent none. */
  fileCount: number | null;
}

/** Normalize a `revert.stage` payload (`SessionRevert`, possibly enveloped). */
export function extractSessionRevert(value: unknown): SessionRevertInfo | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const messageID = readString(data, ["messageID", "messageId"]);
  if (messageID === null) return null;
  const files = data["files"];
  return { messageID, fileCount: Array.isArray(files) ? files.length : null };
}

/** POST /api/session/{sessionID}/revert/stage — stage a revert at one message. */
export function stageSessionRevert(
  server: ServerConfig,
  sessionID: string,
  messageID: string,
): Promise<ApiResult<SessionRevertInfo>> {
  return guarded(async () => {
    try {
      const staged = extractSessionRevert(
        await (await makeClient(server)).session.revert.stage({ sessionID, messageID }),
      );
      if (staged === null) throw new Error(t`Unerwartete Revert-Antwort vom Server.`);
      return staged;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Revert")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/revert/stage`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ messageID }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/session/${sessionID}/revert/stage failed with status ${response.status}`,
        );
      }
      const staged = extractSessionRevert(await response.json());
      if (staged === null) throw new Error(t`Unerwartete Revert-Antwort vom Server.`);
      return staged;
    }
  });
}

/** POST /api/session/{sessionID}/revert/commit — apply the staged revert. */
export function commitSessionRevert(server: ServerConfig, sessionID: string) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.revert.commit({ sessionID });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      // The endpoint declares `empty: true` (204, no body) — a bare POST.
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/revert/commit`,
        {
          method: "POST",
          headers: { ...(await fetchAuthHeaders(server)) },
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/session/${sessionID}/revert/commit failed with status ${response.status}`,
        );
      }
    }
  });
}

/** DELETE /api/session/{sessionID}/revert — drop the staged revert. */
export function clearSessionRevert(server: ServerConfig, sessionID: string) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.revert.clear({ sessionID });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/revert`,
        {
          method: "DELETE",
          headers: { ...(await fetchAuthHeaders(server)) },
        },
      );
      if (!response.ok) {
        throw new Error(
          `DELETE /api/session/${sessionID}/revert failed with status ${response.status}`,
        );
      }
    }
  });
}

/** A transfer payload keeps `info` + `messages`; `location` passes through when present. */
export interface SessionTransferPayload {
  info: Record<string, unknown>;
  messages: unknown[];
  location?: Record<string, unknown>;
}

/** Validate pasted/imported JSON: a transfer needs `info` and `messages`. */
export function extractSessionTransfer(value: unknown): SessionTransferPayload | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const info = record["info"];
  const messages = record["messages"];
  if (info === null || typeof info !== "object" || Array.isArray(info)) return null;
  if (!Array.isArray(messages)) return null;
  const location = record["location"];
  const payload: SessionTransferPayload = { info: info as Record<string, unknown>, messages };
  // `import` accepts an optional `location` (see `SessionImportInput`), so a
  // re-exported payload keeps working when the export carried one.
  if (location !== null && typeof location === "object" && !Array.isArray(location)) {
    payload.location = location as Record<string, unknown>;
  }
  return payload;
}

/** Parse transfer JSON from a file or textarea; null with a German reason on failure. */
export function parseSessionTransferText(text: string): {
  payload: SessionTransferPayload | null;
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { payload: null, error: t`Die Datei enthält kein gültiges JSON.` };
  }
  const payload = extractSessionTransfer(parsed);
  if (payload === null) {
    return {
      payload: null,
      error: t`Kein gültiger Session-Export: „info“ und „messages“ fehlen.`,
    };
  }
  return { payload, error: null };
}

/** GET /api/experimental/session/{sessionID}/export — export sharable JSON. */
export function exportSession(
  server: ServerConfig,
  sessionID: string,
): Promise<ApiResult<SessionTransferPayload>> {
  return guarded(async () => {
    try {
      const payload = extractSessionTransfer(
        await (await makeClient(server)).session.export({ sessionID }),
      );
      if (payload === null) throw new Error(t`Unerwartete Export-Antwort vom Server.`);
      return payload;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Export")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/experimental/session/${encodeURIComponent(sessionID)}/export`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(
          `GET /api/experimental/session/${sessionID}/export failed with status ${response.status}`,
        );
      }
      const payload = extractSessionTransfer(await response.json());
      if (payload === null) throw new Error(t`Unerwartete Export-Antwort vom Server.`);
      return payload;
    }
  });
}

/**
 * POST /api/experimental/session/import — import transfer JSON as a new
 * session. The client input type is reconstructed from the validated payload
 * (the cast only bridges the generated input wrapper, the shape is verified).
 */
export function importSession(
  server: ServerConfig,
  payload: SessionTransferPayload,
): Promise<ApiResult<SessionInfo>> {
  return guarded(async () => {
    try {
      const client = await makeClient(server);
      type ImportInput = Parameters<typeof client.session.import>[0];
      const info = extractSessionInfo(
        await client.session.import(payload as unknown as ImportInput),
      );
      if (info === null) throw new Error(t`Unerwartete Session-Antwort vom Server.`);
      return info;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Session")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/experimental/session/import`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(
          `POST /api/experimental/session/import failed with status ${response.status}`,
        );
      }
      const info = extractSessionInfo(await response.json());
      if (info === null) throw new Error(t`Unerwartete Session-Antwort vom Server.`);
      return info;
    }
  });
}

/** One runnable slash command (`CommandInfo`): name plus optional description. */
export interface CommandRow {
  name: string;
  description: string | null;
}

/** Normalize a `command.list` payload (`{ location, data: [...] }`). */
export function extractCommands(value: unknown): CommandRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return { name: String(entry), description: null };
    }
    const record = entry as Record<string, unknown>;
    return {
      name: readString(record, ["name"]) ?? `befehl-${index}`,
      description: readString(record, ["description"]),
    };
  });
}

/** GET /api/command — available slash commands, read-only. */
export function listCommands(server: ServerConfig): Promise<ApiResult<CommandRow[]>> {
  return guarded(async () => {
    try {
      return extractCommands(await (await makeClient(server)).command.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/command`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/command failed with status ${response.status}`);
      }
      return extractCommands(await response.json());
    }
  });
}

/** One skill (`SkillInfo`): id, name and optional description. */
export interface SkillRow {
  id: string;
  name: string;
  description: string | null;
}

/** Normalize a `skill.list` payload (`{ location, data: [...] }`). */
export function extractSkills(value: unknown): SkillRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      const fallback = `skill-${index}`;
      return { id: fallback, name: String(entry) === "" ? fallback : String(entry), description: null };
    }
    const record = entry as Record<string, unknown>;
    const id = readString(record, ["id"]) ?? `skill-${index}`;
    return {
      id,
      name: readString(record, ["name"]) ?? id,
      description: readString(record, ["description"]),
    };
  });
}

/** GET /api/skill — available skills, read-only. */
export function listSkills(server: ServerConfig): Promise<ApiResult<SkillRow[]>> {
  return guarded(async () => {
    try {
      return extractSkills(await (await makeClient(server)).skill.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/skill`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/skill failed with status ${response.status}`);
      }
      return extractSkills(await response.json());
    }
  });
}

/** POST /api/session/{sessionID}/command — run a slash command in the session. */
export function runSessionCommand(
  server: ServerConfig,
  sessionID: string,
  name: string,
  text: string,
) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.command({ sessionID, name, text });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/command`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ name, text }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/session/${sessionID}/command failed with status ${response.status}`,
        );
      }
    }
  });
}

/** One websearch provider (`WebSearchProvider`): id plus display name. */
export interface WebsearchProviderRow {
  id: string;
  name: string;
}

/** Normalize a `websearch.providers` payload (`{ location, data: [...] }`). */
export function extractWebsearchProviders(value: unknown): WebsearchProviderRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      const fallback = `anbieter-${index}`;
      return { id: fallback, name: String(entry) === "" ? fallback : String(entry) };
    }
    const record = entry as Record<string, unknown>;
    const id = readString(record, ["id"]) ?? `anbieter-${index}`;
    return { id, name: readString(record, ["name", "canonical"]) ?? id };
  });
}

/** GET /api/websearch/provider — available search providers, read-only. */
export function listWebsearchProviders(
  server: ServerConfig,
): Promise<ApiResult<WebsearchProviderRow[]>> {
  return guarded(async () => {
    try {
      return extractWebsearchProviders(await (await makeClient(server)).websearch.providers());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/websearch/provider`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/websearch/provider failed with status ${response.status}`);
      }
      return extractWebsearchProviders(await response.json());
    }
  });
}

/** One websearch hit (`WebSearchResult`): URL plus optional title and snippet. */
export interface WebsearchResultRow {
  url: string;
  title: string | null;
  content: string | null;
}

/** A finished `websearch.query` call: which provider answered plus its hits. */
export interface WebsearchAnswer {
  providerID: string;
  results: WebsearchResultRow[];
}

/**
 * Normalize a `websearch.query` payload (`{ location, data: { providerID,
 * results } }` — note `data` is an object here, not a row list).
 */
export function extractWebsearchAnswer(value: unknown): WebsearchAnswer | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const providerID = readString(data, ["providerID", "providerId"]) ?? "";
  const raw = data["results"];
  if (!Array.isArray(raw)) return null;
  return {
    providerID,
    results: raw.map((entry, index) => {
      if (entry === null || typeof entry !== "object") {
        return { url: String(entry), title: null, content: null };
      }
      const row = entry as Record<string, unknown>;
      return {
        url: readString(row, ["url", "link"]) ?? `treffer-${index}`,
        title: readString(row, ["title"]),
        content: readString(row, ["content", "snippet"]),
      };
    }),
  };
}

/** POST /api/websearch — search the web through one provider. */
export function queryWebsearch(
  server: ServerConfig,
  query: string,
  providerID?: string,
): Promise<ApiResult<WebsearchAnswer>> {
  return guarded(async () => {
    const input = providerID === undefined ? { query } : { query, providerID };
    try {
      const answer = extractWebsearchAnswer(
        await (await makeClient(server)).websearch.query(input),
      );
      if (answer === null) throw new Error(t`Unerwartete Such-Antwort vom Server.`);
      return answer;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Such")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/websearch`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`POST /api/websearch failed with status ${response.status}`);
      }
      const answer = extractWebsearchAnswer(await response.json());
      if (answer === null) throw new Error(t`Unerwartete Such-Antwort vom Server.`);
      return answer;
    }
  });
}

/** One queued inbox entry (`SessionInboxInfo`): user/synthetic/compaction/move. */
export interface SessionInboxRow {
  id: string;
  sessionID: string;
  kind: "user" | "synthetic" | "compaction" | "move" | "unbekannt";
  summary: string;
  /** Planned delivery (`SessionInboxDelivery`), null when the server sent none. */
  delivery: "steer" | "queue" | null;
}

const INBOX_KINDS: readonly SessionInboxRow["kind"][] = [
  "user",
  "synthetic",
  "compaction",
  "move",
];

function inboxSummary(entry: Record<string, unknown>, kind: SessionInboxRow["kind"]): string {
  const payload: unknown = entry["payload"];
  if (payload !== null && typeof payload === "object") {
    const text = readString(payload as Record<string, unknown>, ["text", "description"]);
    if (text !== null) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  if (kind === "compaction") return "Kompaktierung";
  if (kind === "move") return "Session-Umzug";
  return kind;
}

/** Normalize a `session.inbox.list` payload into queued-entry rows. */
export function extractSessionInbox(value: unknown): SessionInboxRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return {
        id: `eintrag-${index}`,
        sessionID: "",
        kind: "unbekannt" as const,
        summary: String(entry),
        delivery: null,
      };
    }
    const record = entry as Record<string, unknown>;
    const raw = readString(record, ["type"]);
    const kind: SessionInboxRow["kind"] = INBOX_KINDS.includes(raw as SessionInboxRow["kind"])
      ? (raw as SessionInboxRow["kind"])
      : "unbekannt";
    const deliveryRaw = record["delivery"];
    return {
      id: readString(record, ["id", "inboxID"]) ?? `eintrag-${index}`,
      sessionID: readString(record, ["sessionID", "sessionId"]) ?? "",
      kind,
      summary: inboxSummary(record, kind),
      delivery: deliveryRaw === "steer" || deliveryRaw === "queue" ? deliveryRaw : null,
    };
  });
}

/** GET /api/session/{sessionID}/inbox — queued entries of one session. */
export function listSessionInbox(
  server: ServerConfig,
  sessionID: string,
): Promise<ApiResult<SessionInboxRow[]>> {
  return guarded(async () => {
    try {
      return extractSessionInbox(await (await makeClient(server)).session.inbox.list({ sessionID }));
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/inbox`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(`GET /api/session/${sessionID}/inbox failed with status ${response.status}`);
      }
      return extractSessionInbox(await response.json());
    }
  });
}

/** Planned delivery of a queued inbox entry (`SessionInboxDelivery`). */
export type SessionInboxDelivery = "steer" | "queue";

/**
 * PATCH /api/session/{sessionID}/inbox/{inboxID} — change how a queued entry
 * is delivered (`steer`: interrupt and run now, `queue`: wait its turn).
 */
export function updateSessionInbox(
  server: ServerConfig,
  sessionID: string,
  inboxID: string,
  delivery: SessionInboxDelivery,
) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.inbox.update({ sessionID, inboxID, delivery });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/inbox/${encodeURIComponent(inboxID)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ delivery }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `PATCH /api/session/${sessionID}/inbox/${inboxID} failed with status ${response.status}`,
        );
      }
    }
  });
}

/** DELETE /api/session/{sessionID}/inbox/{inboxID} — drop a queued entry. */
export function cancelSessionInbox(server: ServerConfig, sessionID: string, inboxID: string) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.inbox.cancel({ sessionID, inboxID });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/inbox/${encodeURIComponent(inboxID)}`,
        {
          method: "DELETE",
          headers: { ...(await fetchAuthHeaders(server)) },
        },
      );
      if (!response.ok) {
        throw new Error(
          `DELETE /api/session/${sessionID}/inbox/${inboxID} failed with status ${response.status}`,
        );
      }
    }
  });
}

/** One pending form (`FormInfo`): id, owning session and title. */
export interface SessionFormRow {
  id: string;
  sessionID: string;
  title: string;
}

/** Normalize a `session.form.list` payload into pending-form rows. */
export function extractSessionForms(value: unknown): SessionFormRow[] {
  return extractListRows(value).map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return { id: `formular-${index}`, sessionID: "", title: String(entry) };
    }
    const record = entry as Record<string, unknown>;
    const id = readString(record, ["id", "formID"]) ?? `formular-${index}`;
    return {
      id,
      sessionID: readString(record, ["sessionID", "sessionId"]) ?? "",
      title: readString(record, ["title", "name"]) ?? id,
    };
  });
}

/** GET /api/session/{sessionID}/form — pending forms of one session. */
export function listSessionForms(
  server: ServerConfig,
  sessionID: string,
): Promise<ApiResult<SessionFormRow[]>> {
  return guarded(async () => {
    try {
      return extractSessionForms(await (await makeClient(server)).session.form.list({ sessionID }));
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/form`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(`GET /api/session/${sessionID}/form failed with status ${response.status}`);
      }
      return extractSessionForms(await response.json());
    }
  });
}

/** Answer value of a form reply (`FormAnswer`): one entry per field key. */
export type FormAnswerValue = string | number | boolean | string[];

/** Validate a pasted reply: it must be a JSON object (the server checks fields). */
export function parseFormAnswerText(text: string): {
  answer: Record<string, FormAnswerValue> | null;
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { answer: null, error: t`Die Antwort enthält kein gültiges JSON.` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { answer: null, error: t`Die Antwort muss ein JSON-Objekt sein.` };
  }
  const answer: Record<string, FormAnswerValue> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      answer[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((entry): entry is string => typeof entry === "string")
    ) {
      answer[key] = value;
    } else {
      return {
        answer: null,
        error: t`Feld „${key}“ hat einen ungültigen Wert (erlaubt: Text, Zahl, Ja/Nein, Textliste).`,
      };
    }
  }
  return { answer, error: null };
}

/** POST /api/session/{sessionID}/form/{formID}/reply — answer a pending form. */
export function replySessionForm(
  server: ServerConfig,
  sessionID: string,
  formID: string,
  answer: Record<string, FormAnswerValue>,
) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.form.reply({ sessionID, formID, answer });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/form/${encodeURIComponent(formID)}/reply`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify({ answer }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/session/${sessionID}/form/${formID}/reply failed with status ${response.status}`,
        );
      }
    }
  });
}

/** DELETE /api/session/{sessionID}/form/{formID} — cancel a pending form. */
export function cancelSessionForm(server: ServerConfig, sessionID: string, formID: string) {
  return guarded(async () => {
    try {
      await (await makeClient(server)).session.form.cancel({ sessionID, formID });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/session/${encodeURIComponent(sessionID)}/form/${encodeURIComponent(formID)}`,
        {
          method: "DELETE",
          headers: { ...(await fetchAuthHeaders(server)) },
        },
      );
      if (!response.ok) {
        throw new Error(
          `DELETE /api/session/${sessionID}/form/${formID} failed with status ${response.status}`,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Parity batch 4: integrations, config (read-only), session terminal
//
// REST paths verified against the installed package
// (`node_modules/@opencode/client`, chunk `service-version-nyqggzs9.js`):
// - `integration.list` → GET /api/integration
// - `integration.get` → GET /api/integration/{integrationID}
// - `integration.connect.key` → POST /api/integration/{id}/connect/key
//   {key, answer?, label?} (204, empty)
// - `integration.oauth.connect` → POST /api/integration/{id}/connect/oauth
//   {methodID, answer?, label?} → `{ location, data: IntegrationAttempt }`
// - `integration.oauth.status` →
//   GET /api/integration/{id}/connect/oauth/{attemptID} →
//   `{ location, data: IntegrationAttemptStatus }`
// - `config.get` → GET /api/config (→ `ConfigEntry[]`, no envelope)
// - `config.shells` → GET /api/config/shell (→ `ConfigShellOption[]`)
// - `experimental.persistentPty.read` →
//   GET /api/experimental/session/{sessionID}/terminal/read (?lines=) → the
//   `PersistentPtyReadResult` (or null when the session has no terminal).
//
// Deliberately NOT implemented (documented in `features/05-parity.md`):
// - `config.update` (PATCH /api/experimental/config) — global-config writes.
// - OAuth `complete`/`cancel` and the `command` connect flow — the redirect
//   and the server-side command run cannot be driven from a static page.
// - `credential.*` — stored credentials management stays server-side.
// - `pty.snapshot` (`GET /api/experimental/persistent-pty/{ptyID}/snapshot`)
//   needs a persistent-PTY id, which no list endpoint hands out statically —
//   the per-session `terminal/read` above is the static-friendly read path.
// ---------------------------------------------------------------------------

/** One connect method of an integration (`IntegrationMethod` union). */
export interface IntegrationMethodRow {
  kind: "oauth" | "key" | "command" | "env" | "unbekannt";
  /** The method id (`oauth`/`command` carry one, `key`/`env` do not). */
  id: string | null;
  label: string | null;
}

/** Normalize the `methods` array of one `IntegrationInfo`. */
export function extractIntegrationMethods(value: unknown): IntegrationMethodRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return { kind: "unbekannt" as const, id: null, label: String(entry) };
    }
    const record = entry as Record<string, unknown>;
    const raw = record["type"];
    const kind =
      raw === "oauth" || raw === "key" || raw === "command" || raw === "env"
        ? raw
        : "unbekannt";
    return {
      kind,
      id: readString(record, ["id"]),
      label:
        readString(record, ["label"]) ??
        (Array.isArray(record["names"])
          ? (record["names"] as unknown[]).filter((n): n is string => typeof n === "string").join(", ") || null
          : null) ??
        (kind === "unbekannt" ? `methode-${index}` : null),
    };
  });
}

export interface IntegrationConnectionRow {
  kind: "credential" | "env" | "unbekannt";
  label: string;
  /** How the connection was made (`key`/`oauth` for credentials). */
  method: string | null;
  /** True while the server waits for authentication (`needs_auth`). */
  needsAuth: boolean;
  message: string | null;
  /** Provider URL for finishing authentication, when the server sent one. */
  url: string | null;
}

/** Normalize the `connections` array of one `IntegrationInfo`. */
export function extractIntegrationConnections(value: unknown): IntegrationConnectionRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      return {
        kind: "unbekannt" as const,
        label: String(entry),
        method: null,
        needsAuth: false,
        message: null,
        url: null,
      };
    }
    const record = entry as Record<string, unknown>;
    const raw = record["type"];
    const kind = raw === "credential" || raw === "env" ? raw : "unbekannt";
    const statusRaw: unknown = record["status"];
    const statusRecord =
      statusRaw !== null && typeof statusRaw === "object"
        ? (statusRaw as Record<string, unknown>)
        : null;
    return {
      kind,
      label: readString(record, ["label", "name"]) ?? `verbindung-${index}`,
      method: readString(record, ["method"]),
      needsAuth: statusRecord?.["status"] === "needs_auth",
      message: statusRecord === null ? null : readString(statusRecord, ["message"]),
      url: statusRecord === null ? null : readString(statusRecord, ["url"]),
    };
  });
}

/** One integration (`IntegrationInfo`): id, name, methods and connections. */
export interface IntegrationRow {
  id: string;
  name: string;
  methods: IntegrationMethodRow[];
  connections: IntegrationConnectionRow[];
}

function toIntegrationRow(entry: unknown, index: number): IntegrationRow {
  if (entry === null || typeof entry !== "object") {
    const fallback = `integration-${index}`;
    return { id: fallback, name: String(entry) === "" ? fallback : String(entry), methods: [], connections: [] };
  }
  const record = entry as Record<string, unknown>;
  const id = readString(record, ["id"]) ?? `integration-${index}`;
  return {
    id,
    name: readString(record, ["name"]) ?? id,
    methods: extractIntegrationMethods(record["methods"]),
    connections: extractIntegrationConnections(record["connections"]),
  };
}

/** Normalize an `integration.list` payload (`{ location, data: [...] }`). */
export function extractIntegrations(value: unknown): IntegrationRow[] {
  return extractListRows(value).map(toIntegrationRow);
}

/** Normalize an `integration.get` payload (`{ location, data: IntegrationInfo }`). */
export function extractIntegrationDetail(value: unknown): IntegrationRow | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data: unknown = record["data"];
  if (data !== null && typeof data === "object") return toIntegrationRow(data, 0);
  // A bare `IntegrationInfo` without envelope passes through as well.
  if (readString(record, ["id"]) !== null) return toIntegrationRow(record, 0);
  return null;
}

/** GET /api/integration — configured integrations with methods and connections. */
export function listIntegrations(server: ServerConfig): Promise<ApiResult<IntegrationRow[]>> {
  return guarded(async () => {
    try {
      return extractIntegrations(await (await makeClient(server)).integration.list());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/integration`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/integration failed with status ${response.status}`);
      }
      return extractIntegrations(await response.json());
    }
  });
}

/** GET /api/integration/{integrationID} — detail of one integration. */
export function getIntegration(
  server: ServerConfig,
  integrationID: string,
): Promise<ApiResult<IntegrationRow>> {
  return guarded(async () => {
    try {
      const detail = extractIntegrationDetail(
        await (await makeClient(server)).integration.get({ integrationID }),
      );
      if (detail === null) throw new Error(t`Unerwartete Integrations-Antwort vom Server.`);
      return detail;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Integrations")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/integration/${encodeURIComponent(integrationID)}`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(
          `GET /api/integration/${integrationID} failed with status ${response.status}`,
        );
      }
      const detail = extractIntegrationDetail(await response.json());
      if (detail === null) throw new Error(t`Unerwartete Integrations-Antwort vom Server.`);
      return detail;
    }
  });
}

/**
 * POST /api/integration/{integrationID}/connect/key — connect with an API key.
 * `answer` carries the key method's form fields when it declares any
 * (`IntegrationKeyMethod.form`); `label` names the stored credential.
 */
export function connectIntegrationKey(
  server: ServerConfig,
  integrationID: string,
  key: string,
  options: { label?: string; answer?: Record<string, FormAnswerValue> } = {},
) {
  return guarded(async () => {
    const answer = options.answer;
    const label = options.label !== undefined && options.label !== "" ? options.label : undefined;
    // The ids travel in the path; the body only carries key material.
    const body = {
      key,
      ...(answer !== undefined ? { answer } : {}),
      ...(label !== undefined ? { label } : {}),
    };
    try {
      await (await makeClient(server)).integration.connect.key({
        integrationID,
        ...body,
      });
      return;
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/integration/${encodeURIComponent(integrationID)}/connect/key`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/integration/${integrationID}/connect/key failed with status ${response.status}`,
        );
      }
    }
  });
}

/** A started OAuth attempt (`IntegrationAttempt`): URL + instructions. */
export interface IntegrationOauthAttempt {
  attemptID: string;
  url: string;
  instructions: string;
  mode: string;
}

/** Normalize an `oauth.connect` payload (`{ location, data: IntegrationAttempt }`). */
export function extractIntegrationOauthAttempt(value: unknown): IntegrationOauthAttempt | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const attemptID = readString(data, ["attemptID", "attemptId"]);
  const url = readString(data, ["url"]);
  if (attemptID === null || url === null) return null;
  return {
    attemptID,
    url,
    instructions: readString(data, ["instructions"]) ?? "",
    mode: readString(data, ["mode"]) ?? "auto",
  };
}

/**
 * POST /api/integration/{integrationID}/connect/oauth — begin an OAuth flow.
 * Read-only from the PWA side: the returned URL is opened outside the app
 * (the static page cannot handle the provider redirect), the app only polls
 * the attempt status via `getIntegrationOauthStatus`.
 */
export function beginIntegrationOauth(
  server: ServerConfig,
  integrationID: string,
  methodID: string,
  label?: string,
): Promise<ApiResult<IntegrationOauthAttempt>> {
  return guarded(async () => {
    // The ids travel in the path; the body only carries the method ref.
    const body = {
      methodID,
      ...(label !== undefined && label !== "" ? { label } : {}),
    };
    try {
      const attempt = extractIntegrationOauthAttempt(
        await (await makeClient(server)).integration.oauth.connect({ integrationID, ...body }),
      );
      if (attempt === null) throw new Error(t`Unerwartete OAuth-Antwort vom Server.`);
      return attempt;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete OAuth")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/integration/${encodeURIComponent(integrationID)}/connect/oauth`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(await fetchAuthHeaders(server)) },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /api/integration/${integrationID}/connect/oauth failed with status ${response.status}`,
        );
      }
      const attempt = extractIntegrationOauthAttempt(await response.json());
      if (attempt === null) throw new Error(t`Unerwartete OAuth-Antwort vom Server.`);
      return attempt;
    }
  });
}

/** State of an OAuth attempt (`IntegrationAttemptStatus`). */
export type IntegrationAttemptState = "pending" | "complete" | "failed" | "expired";

export interface IntegrationOauthState {
  status: IntegrationAttemptState;
  message: string | null;
}

const OAUTH_STATES: readonly IntegrationAttemptState[] = [
  "pending",
  "complete",
  "failed",
  "expired",
];

/** Normalize an `oauth.status` payload; null when the answer is unusable. */
export function extractIntegrationOauthStatus(value: unknown): IntegrationOauthState | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record["data"] !== null && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const raw = readString(data, ["status"]);
  if (raw === null || !OAUTH_STATES.includes(raw as IntegrationAttemptState)) return null;
  return { status: raw as IntegrationAttemptState, message: readString(data, ["message"]) };
}

/**
 * GET /api/integration/{integrationID}/connect/oauth/{attemptID} — poll the
 * state of a started OAuth attempt (read-only).
 */
export function getIntegrationOauthStatus(
  server: ServerConfig,
  integrationID: string,
  attemptID: string,
): Promise<ApiResult<IntegrationOauthState>> {
  return guarded(async () => {
    try {
      const state = extractIntegrationOauthStatus(
        await (await makeClient(server)).integration.oauth.status({ integrationID, attemptID }),
      );
      if (state === null) throw new Error(t`Unerwartete OAuth-Antwort vom Server.`);
      return state;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete OAuth")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/integration/${encodeURIComponent(integrationID)}/connect/oauth/${encodeURIComponent(attemptID)}`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(
          `GET /api/integration/${integrationID}/connect/oauth/${attemptID} failed with status ${response.status}`,
        );
      }
      const state = extractIntegrationOauthStatus(await response.json());
      if (state === null) throw new Error(t`Unerwartete OAuth-Antwort vom Server.`);
      return state;
    }
  });
}

/** One config document (`ConfigEntry`: path + the `info` fields worth showing). */
export interface ConfigEntryRow {
  path: string | null;
  shell: string | null;
  model: string | null;
  defaultAgent: string | null;
  update: string | null;
  share: string | null;
}

function configModelLabel(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const providerID = readString(record, ["providerID", "providerId"]);
    const model = readString(record, ["model", "id", "modelID"]);
    if (providerID !== null && model !== null) {
      const variant = readString(record, ["variant"]);
      return variant === null ? `${providerID}/${model}` : `${providerID}/${model}#${variant}`;
    }
  }
  return null;
}

/** Normalize a `config.get` payload (`ConfigEntry[]`, no envelope). */
export function extractConfigEntries(value: unknown): ConfigEntryRow[] {
  const list = Array.isArray(value) ? value : extractListRows(value);
  return list.map((entry) => {
    if (entry === null || typeof entry !== "object") {
      return {
        path: null,
        shell: null,
        model: null,
        defaultAgent: null,
        update: null,
        share: null,
      };
    }
    const record = entry as Record<string, unknown>;
    const infoRaw: unknown = record["info"];
    const info =
      infoRaw !== null && typeof infoRaw === "object"
        ? (infoRaw as Record<string, unknown>)
        : record;
    return {
      path: readString(record, ["path"]),
      shell: readString(info, ["shell"]),
      model: configModelLabel(info["model"]),
      defaultAgent: readString(info, ["default_agent", "defaultAgent"]),
      update: readString(info, ["update"]),
      share: readString(info, ["share"]),
    };
  });
}

/** GET /api/config — effective configuration documents. Read-only. */
export function getConfig(server: ServerConfig): Promise<ApiResult<ConfigEntryRow[]>> {
  return guarded(async () => {
    try {
      return extractConfigEntries(await (await makeClient(server)).config.get());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/config`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/config failed with status ${response.status}`);
      }
      return extractConfigEntries(await response.json());
    }
  });
}

/** One usable shell (`ConfigShellOption`): path, display name, acceptability. */
export interface ConfigShellRow {
  path: string;
  name: string;
  acceptable: boolean;
}

/** Normalize a `config.shells` payload (`ConfigShellOption[]`, no envelope). */
export function extractConfigShells(value: unknown): ConfigShellRow[] {
  const list = Array.isArray(value) ? value : extractListRows(value);
  return list.map((entry, index) => {
    if (entry === null || typeof entry !== "object") {
      const fallback = `shell-${index}`;
      return { path: fallback, name: String(entry) === "" ? fallback : String(entry), acceptable: false };
    }
    const record = entry as Record<string, unknown>;
    const path = readString(record, ["path"]) ?? `shell-${index}`;
    return {
      path,
      name: readString(record, ["name"]) ?? path,
      acceptable: record["acceptable"] === true,
    };
  });
}

/** GET /api/config/shell — shells the server accepts. Read-only. */
export function listConfigShells(server: ServerConfig): Promise<ApiResult<ConfigShellRow[]>> {
  return guarded(async () => {
    try {
      return extractConfigShells(await (await makeClient(server)).config.shells());
    } catch {
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/config/shell`, {
        headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) },
      });
      if (!response.ok) {
        throw new Error(`GET /api/config/shell failed with status ${response.status}`);
      }
      return extractConfigShells(await response.json());
    }
  });
}

/** Read-only screen of a session terminal (`PersistentPtyReadResult`). */
export interface SessionTerminalScreen {
  title: string | null;
  columns: number;
  rows: number;
  cursorX: number;
  cursorY: number;
  text: string;
}

/**
 * Normalize a `persistentPty.read` payload. `null` (no terminal attached to
 * the session) passes through as `null` — it is a valid answer, not an error.
 * Anything else without a `screen.text` is unusable and stays `null`.
 */
export function extractTerminalScreen(value: unknown): SessionTerminalScreen | null {
  if (value === null) return null;
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data: unknown =
    record["data"] !== undefined && record["screen"] === undefined ? record["data"] : record;
  if (data === null) return null;
  if (typeof data !== "object") return null;
  const info = data as Record<string, unknown>;
  const screen: unknown = info["screen"];
  if (screen === null || typeof screen !== "object") return null;
  const screenRecord = screen as Record<string, unknown>;
  if (typeof screenRecord["text"] !== "string") return null;
  const cursor: unknown = screenRecord["cursor"];
  const cursorRecord =
    cursor !== null && typeof cursor === "object" ? (cursor as Record<string, unknown>) : null;
  const cursorX = cursorRecord?.["x"];
  const cursorY = cursorRecord?.["y"];
  return {
    title: readString(info, ["title"]),
    columns: typeof screenRecord["cols"] === "number" ? screenRecord["cols"] : 0,
    rows: typeof screenRecord["rows"] === "number" ? screenRecord["rows"] : 0,
    cursorX: typeof cursorX === "number" ? cursorX : 0,
    cursorY: typeof cursorY === "number" ? cursorY : 0,
    text: screenRecord["text"],
  };
}

/**
 * GET /api/experimental/session/{sessionID}/terminal/read — read-only screen
 * of the session terminal (`null` when the session has no terminal). No
 * emulator, no input: the text renders in a `<pre>`, which keeps the bundle
 * lean (no xterm dependency).
 */
export function readSessionTerminal(
  server: ServerConfig,
  sessionID: string,
  lines?: number,
): Promise<ApiResult<SessionTerminalScreen | null>> {
  return guarded(async () => {
    try {
      const payload = await (await makeClient(server)).experimental.persistentPty.read(
        lines === undefined ? { sessionID } : { sessionID, lines },
      );
      // `null` is a valid answer (the session has no terminal attached).
      if (payload === null) return null;
      const screen = extractTerminalScreen(payload);
      if (screen === null) throw new Error(t`Unerwartete Terminal-Antwort vom Server.`);
      return screen;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unerwartete Terminal")) throw error;
      const baseUrl = server.baseUrl.replace(/\/$/, "");
      const query = lines === undefined ? "" : `?lines=${encodeURIComponent(String(lines))}`;
      const response = await fetch(
        `${baseUrl}/api/experimental/session/${encodeURIComponent(sessionID)}/terminal/read${query}`,
        { headers: { accept: "application/json", ...(await fetchAuthHeaders(server)) } },
      );
      if (!response.ok) {
        throw new Error(
          `GET /api/experimental/session/${sessionID}/terminal/read failed with status ${response.status}`,
        );
      }
      const payload: unknown = await response.json();
      if (payload === null) return null;
      const screen = extractTerminalScreen(payload);
      if (screen === null) throw new Error(t`Unerwartete Terminal-Antwort vom Server.`);
      return screen;
    }
  });
}
