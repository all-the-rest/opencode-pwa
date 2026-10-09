/**
 * Dock stack of a running session.
 *
 * While a session runs, everything the agent needs answered (permission
 * requests, questions/forms, queued follow-ups, a staged revert) must appear
 * INSIDE the session, directly above the composer — not as a detour through the
 * tools page. This module holds the state of that stack: which docks exist and
 * in which order they render. Pure reducer plus pure event folding, so the
 * whole decision is unit-testable without React.
 *
 * Endpoints and events used here are all verified against the installed client
 * (`node_modules/@opencode/client/dist/promise/generated/{client,types}.d.ts`
 * and the service chunk):
 *   - GET  /api/session/{sessionID}/permission          → `permission.list`
 *   - POST /api/session/{sessionID}/permission/{requestID}/reply
 *   - GET  /api/session/{sessionID}/form                 → `session.form.list`
 *   - GET  /api/session/{sessionID}/inbox                → `session.inbox.list`
 *   - PATCH/DELETE /api/session/{sessionID}/inbox/{inboxID}
 *   - POST /api/session/{sessionID}/revert/{stage,commit}, DELETE …/revert
 * Events (`types.d.ts`):
 *   - `permission.asked` (2291) / `permission.replied` (2312)
 *   - `form.created` / `form.replied` (2751) / `form.cancelled` (36123)
 *   - `session.inbox.enqueued` (3222) / `.delivered` / `.cancelled` /
 *     `.delivery.changed`
 *   - `session.revert.staged` (2504) / `.committed` (1377) / `.cleared` (1360)
 *
 * There is NO todo endpoint in the installed client (no `todo` symbol anywhere
 * in `generated/types.d.ts`), so the todo dock stays an explicit extension
 * point and renders nothing. See `EXTENSION_POINT_TODOS`.
 */

import { extractFormFields, type SessionFormField } from "./formFields.ts";

/** A pending permission request of the session. */
export interface DockPermission {
  id: string;
  action: string;
  resources: string[];
  /** Server-side hint (`PermissionRequest.message`), null when absent. */
  message: string | null;
}

/** A queued inbox / follow-up entry of the session. */
export interface DockInboxItem {
  id: string;
  kind: string;
  summary: string;
  /** Planned delivery (`SessionInboxDelivery`), null when absent. */
  delivery: "steer" | "queue" | null;
}

/** A staged revert (session + files would roll back to `messageID`). */
export interface DockRevert {
  messageID: string;
  /** Files the revert touches, null when the server sent none. */
  fileCount: number | null;
}

/** A pending form ("question") with its native-renderable fields. */
export interface DockForm {
  id: string;
  title: string;
  fields: SessionFormField[];
}

/**
 * One todo entry. Deliberately unused: no endpoint surfaces todos (see the
 * module note). Kept so the dock stack has a documented slot instead of a
 * missing feature.
 */
export interface DockTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

/** Dock kinds in render order (first entry renders topmost, above the composer). */
export type DockKind = "question" | "permission" | "revert" | "inbox" | "todo";

export interface DockStackState {
  /** Session the stack belongs to; events of other sessions are ignored. */
  sessionID: string;
  permissions: DockPermission[];
  forms: DockForm[];
  inbox: DockInboxItem[];
  revert: DockRevert | null;
  todos: DockTodo[];
}

/** Extension point: the todo dock is blocked on a server-side endpoint. */
export const EXTENSION_POINT_TODOS =
  "Kein Endpoint: Der installierte Client kennt keine Todo-API (kein `todo`-Symbol in generated/types.d.ts). Sobald der Server Todos ausliefert, reicht `dockReducer({type: 'todos'; rows})` — das Dock rendert dann automatisch.";

export const EMPTY_DOCK_STACK: DockStackState = {
  sessionID: "",
  permissions: [],
  forms: [],
  inbox: [],
  revert: null,
  todos: [],
};

export type DockStackAction =
  | { type: "reset"; sessionID: string }
  | { type: "permissions"; rows: DockPermission[] }
  | { type: "forms"; rows: DockForm[] }
  | { type: "inbox"; rows: DockInboxItem[] }
  | { type: "todos"; rows: DockTodo[] }
  | { type: "revert"; revert: DockRevert | null }
  | { type: "event"; event: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readString(source: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (source === null) return null;
  for (const key of keys) {
    const value: unknown = source[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

function eventRecord(event: unknown): Record<string, unknown> | null {
  return isRecord(event) ? event : null;
}

function eventData(event: unknown): Record<string, unknown> | null {
  const root = eventRecord(event);
  if (root === null) return null;
  const data: unknown = root["data"];
  return isRecord(data) ? data : null;
}

/** Session id an event belongs to (camelCase tolerated, like the event hub). */
export function dockEventSessionID(event: unknown): string | null {
  const direct = readString(eventData(event), ["sessionID", "sessionId"]);
  if (direct !== null) return direct;
  // `form.created` nests the owning session one level deeper (`data.form`).
  const data = eventData(event);
  const form: unknown = data?.["form"];
  if (isRecord(form)) {
    const nested = readString(form, ["sessionID", "sessionId"]);
    if (nested !== null) return nested;
  }
  return readString(eventRecord(event), ["sessionID", "sessionId"]);
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** Parse one raw `PermissionRequest` payload. */
export function toDockPermission(value: unknown, fallbackID: string): DockPermission {
  const record = isRecord(value) ? value : {};
  return {
    id: readString(record, ["id", "requestID"]) ?? fallbackID,
    action: readString(record, ["action", "type", "title"]) ?? "unbekannt",
    resources: toStringList(record["resources"]),
    message: readString(record, ["message", "title"]),
  };
}

function dockInboxSummary(record: Record<string, unknown>, kind: string): string {
  const payload: unknown = record["payload"];
  if (isRecord(payload)) {
    const text = readString(payload, ["text", "description"]);
    if (text !== null) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  if (kind === "compaction") return "Kompaktierung";
  if (kind === "move") return "Session-Umzug";
  return kind;
}

/** Parse one raw `SessionInboxItem` + id envelope into a dock row. */
export function toDockInboxItem(id: string, item: unknown): DockInboxItem {
  const record = isRecord(item) ? item : {};
  const kind = readString(record, ["type"]) ?? "unbekannt";
  const delivery: unknown = record["delivery"];
  return {
    id,
    kind,
    summary: dockInboxSummary(record, kind),
    delivery: delivery === "steer" || delivery === "queue" ? delivery : null,
  };
}

/** Parse one raw `SessionRevert` payload. */
export function toDockRevert(value: unknown): DockRevert | null {
  const record = isRecord(value) ? value : null;
  if (record === null) return null;
  const messageID = readString(record, ["messageID", "messageId"]);
  if (messageID === null) return null;
  const files: unknown = record["files"];
  return { messageID, fileCount: Array.isArray(files) ? files.length : null };
}

/** Which docks have content — the render order of the stack. */
export function visibleDocks(state: DockStackState): DockKind[] {
  const kinds: DockKind[] = [];
  if (state.forms.length > 0) kinds.push("question");
  if (state.permissions.length > 0) kinds.push("permission");
  if (state.revert !== null) kinds.push("revert");
  if (state.inbox.length > 0) kinds.push("inbox");
  if (state.todos.length > 0) kinds.push("todo");
  return kinds;
}

/** True when at least one dock has content. */
export function dockStackHasContent(state: DockStackState): boolean {
  return visibleDocks(state).length > 0;
}

/**
 * How many entries of one dock kind stay visible before the rest collapse
 * behind a "N weitere anzeigen" row. A busy stack (a handful of permission
 * cards, several open forms) must not push the composer off-screen, so every
 * kind is capped at its newest {@link DOCK_KIND_LIMIT} entries — those are the
 * ones still most likely to need an answer.
 */
export const DOCK_KIND_LIMIT = 2;

/** One dock kind split into the visible head and its hidden tail count. */
export interface DockKindSplit<T> {
  /** The newest entries (oldest-first); all of them when at/below the limit. */
  visible: T[];
  /** How many older entries hide behind the "N weitere anzeigen" row. */
  hidden: number;
}

/**
 * Split one dock kind's entries at {@link DOCK_KIND_LIMIT}: the newest `limit`
 * stay visible, the older ones collapse. `visible` is always a fresh array, so
 * at or below the limit nothing collapses (`hidden === 0`) and every entry
 * stays. Pure and total.
 */
export function splitDockKind<T>(
  rows: readonly T[],
  limit: number = DOCK_KIND_LIMIT,
): DockKindSplit<T> {
  if (limit <= 0 || rows.length <= limit) {
    return { visible: [...rows], hidden: 0 };
  }
  // Newest = end of the array (events append), so keep the last `limit`.
  return { visible: rows.slice(rows.length - limit), hidden: rows.length - limit };
}

function replaceById<T extends { id: string }>(rows: readonly T[], row: T): T[] {
  const without = rows.filter((entry) => entry.id !== row.id);
  return [...without, row];
}

/**
 * Fold one server event into the dock stack. Unknown events (and events of
 * other sessions) return `state` unchanged, so the whole stream can be piped
 * through. Pure and total.
 */
export function reduceDockEvent(state: DockStackState, event: unknown): DockStackState {
  const root = eventRecord(event);
  if (root === null) return state;
  const type: unknown = root["type"];
  if (typeof type !== "string") return state;
  const data = eventData(event);
  if (dockEventSessionID(event) !== state.sessionID) return state;

  switch (type) {
    case "permission.asked": {
      const record = data ?? {};
      const permission = toDockPermission(record, `anfrage-${state.permissions.length}`);
      if (state.permissions.some((entry) => entry.id === permission.id)) return state;
      return { ...state, permissions: [...state.permissions, permission] };
    }
    case "permission.replied": {
      const requestID = readString(data, ["requestID", "id"]);
      if (requestID === null) return state;
      return { ...state, permissions: state.permissions.filter((entry) => entry.id !== requestID) };
    }
    case "form.created": {
      const form: unknown = data?.["form"];
      if (!isRecord(form)) return state;
      const id = readString(form, ["id", "formID"]);
      if (id === null) return state;
      const row = {
        id,
        title: readString(form, ["title", "name"]) ?? id,
        fields: extractFormFields(form["fields"]),
      };
      return { ...state, forms: replaceById(state.forms, row) };
    }
    case "form.replied":
    case "form.cancelled": {
      const id = readString(data, ["id", "formID"]);
      if (id === null) return state;
      return { ...state, forms: state.forms.filter((entry) => entry.id !== id) };
    }
    case "session.inbox.enqueued": {
      const inboxID = readString(data, ["inboxID", "id"]);
      if (inboxID === null) return state;
      const row = toDockInboxItem(inboxID, data?.["item"]);
      if (state.inbox.some((entry) => entry.id === row.id)) return state;
      return { ...state, inbox: [...state.inbox, row] };
    }
    case "session.inbox.delivered":
    case "session.inbox.cancelled": {
      const inboxID = readString(data, ["inboxID", "id"]);
      if (inboxID === null) return state;
      return { ...state, inbox: state.inbox.filter((entry) => entry.id !== inboxID) };
    }
    case "session.inbox.delivery.changed": {
      const inboxID = readString(data, ["inboxID", "id"]);
      const delivery: unknown = data?.["delivery"];
      if (inboxID === null || (delivery !== "steer" && delivery !== "queue")) return state;
      return {
        ...state,
        inbox: state.inbox.map((entry) =>
          entry.id === inboxID ? { ...entry, delivery } : entry,
        ),
      };
    }
    case "session.revert.staged": {
      const revert = toDockRevert(data?.["revert"]);
      if (revert === null) return state;
      return { ...state, revert };
    }
    case "session.revert.committed":
    case "session.revert.cleared":
      return state.revert === null ? state : { ...state, revert: null };
    default:
      return state;
  }
}

/** The dock stack reducer (total: every action returns a full state). */
export function dockReducer(state: DockStackState, action: DockStackAction): DockStackState {
  switch (action.type) {
    case "reset":
      return { ...EMPTY_DOCK_STACK, sessionID: action.sessionID };
    case "permissions":
      return { ...state, permissions: action.rows };
    case "forms":
      return { ...state, forms: action.rows };
    case "inbox":
      return { ...state, inbox: action.rows };
    case "todos":
      return { ...state, todos: action.rows };
    case "revert":
      return { ...state, revert: action.revert };
    case "event":
      return reduceDockEvent(state, action.event);
  }
}

/** Remove one answered permission request optimistically. */
export function dropDockPermission(state: DockStackState, id: string): DockStackState {
  return { ...state, permissions: state.permissions.filter((entry) => entry.id !== id) };
}

/** Remove one answered form optimistically. */
export function dropDockForm(state: DockStackState, id: string): DockStackState {
  return { ...state, forms: state.forms.filter((entry) => entry.id !== id) };
}

/** Change the planned delivery of one queued entry optimistically. */
export function setDockInboxDelivery(
  state: DockStackState,
  id: string,
  delivery: "steer" | "queue",
): DockStackState {
  return {
    ...state,
    inbox: state.inbox.map((entry) => (entry.id === id ? { ...entry, delivery } : entry)),
  };
}

/** Drop one queued entry optimistically. */
export function dropDockInbox(state: DockStackState, id: string): DockStackState {
  return { ...state, inbox: state.inbox.filter((entry) => entry.id !== id) };
}
