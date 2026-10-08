/**
 * Parser for the real Opencode V2 `message.list` shapes.
 *
 * Verified against the installed client
 * (`node_modules/@opencode/client`, `SessionMessageInfo`): `message.list({
 * sessionID })` returns `{ data: SessionMessageInfo[], cursor }` where
 * `SessionMessageInfo` is a flat discriminated union on `type`. Covered
 * variants (every member of the union):
 *
 * - `agent-switched` / `model-switched` / `location-switched` — switch notes
 * - `user` — prompt text plus optional `files[]` attachments
 * - `synthetic`, `system`, `skill`, `shell` — short status texts
 * - `compaction` (`running` / `completed` / `failed`)
 * - `idle` (`succeeded` / `failed` / `interrupted`)
 * - `assistant` — `content[]` of `text` / `reasoning` / `tool`
 *
 * The legacy spellings `agent-selected` / `model-selected` are tolerated as
 * aliases (old mocks / old cache rows) — they map to the same note kinds.
 * `idle` is part of `SessionMessageInfo` even though it is missing from the
 * `message.list` type *filter* enum, so it stays parsed as well.
 *
 * Legacy `{ id, role, text }` entries (old mocks / old cache rows) keep
 * parsing, and anything else degrades to a `note`/`unknown` message — never
 * a JSON dump. All user-visible labels stay in the components (Lingui); this
 * module only carries structural kinds plus verbatim server text.
 *
 * Tool parts carry `state.input` (`{ [x: string]: JsonValue }`) and
 * `state.metadata` through to the UI: both drive the tool card (label,
 * subtitle, argument chips, change badges). Assistant messages carry
 * `agent`/`model` and, when the turn finished, `time.completed` — the
 * difference to `time.created` becomes the turn duration.
 */

export type ChatRole = "user" | "assistant" | "note";

export type ChatNoteKind =
  | "system"
  | "synthetic"
  | "skill"
  | "shell"
  | "compaction"
  | "idle"
  | "agent"
  | "model"
  | "location"
  | "unknown";

export type ChatToolStatus = "streaming" | "running" | "completed" | "error" | "unknown";

/** Tool statuses that represent a settled outcome (not an in-flight state). */
const FINAL_TOOL_STATUSES: readonly ChatToolStatus[] = ["completed", "error"];

/**
 * Neutralize in-flight tool parts before they are persisted as final.
 *
 * A live `content.updated` snapshot (or a mid-run `message.list`) can carry a
 * tool in `streaming`/`running`. Caching that verbatim would resurrect a stale
 * "Läuft" spinner after a reload, as if the call were still running. Downgrading
 * every non-final status to the neutral `unknown` keeps the call visible (icon +
 * label + arguments) but drops the shimmer and the "Läuft"/streaming badge —
 * the honest state for "we do not know the outcome after a reload".
 * `input`/`metadata` stay so the card remains informative.
 */
export function downgradePartialToolStatus(parts: ChatPart[]): ChatPart[] {
  return parts.map((part) =>
    part.kind === "tool" && !FINAL_TOOL_STATUSES.includes(part.status)
      ? { ...part, status: "unknown", detail: null }
      : part,
  );
}

export interface ChatTextPart {
  kind: "text";
  text: string;
}

export interface ChatReasoningPart {
  kind: "reasoning";
  text: string;
}

export interface ChatToolPart {
  kind: "tool";
  name: string;
  status: ChatToolStatus;
  /** Short detail: error message, text excerpt or file name; null while running. */
  detail: string | null;
  /** `state.input` of the tool call (arguments); `{}` while streaming. */
  input: Record<string, unknown>;
  /** `state.metadata` of the tool call; absent on streaming/errored states. */
  metadata: Record<string, unknown> | null;
}

export interface ChatFilesPart {
  kind: "files";
  files: string[];
}

export interface ChatUnknownPart {
  kind: "unknown";
}

export type ChatPart =
  | ChatTextPart
  | ChatReasoningPart
  | ChatToolPart
  | ChatFilesPart
  | ChatUnknownPart;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Set for `role: "note"` (which V2 variant the note came from). */
  noteKind: ChatNoteKind | null;
  /** Raw server detail the component translates (idle outcome, compaction status). */
  noteDetail: string | null;
  parts: ChatPart[];
  /** Plain-text fallback (revert picker, legacy displays). Never a JSON dump. */
  text: string;
  created: number;
  /** Agent of this message, or the last one seen in the session. */
  agent: string | null;
  /** Model label (`provider/model`) of this message, or the last one seen. */
  model: string | null;
  /** Assistant turn duration in ms (`time.completed - time.created`), when sent. */
  durationMs: number | null;
}

/** Longest excerpt kept per part; longer server text is cut and flagged. */
export const MAX_PART_EXCERPT_CHARS = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

function readTimeCreated(record: Record<string, unknown>): number | null {
  const time: unknown = record["time"];
  if (!isRecord(time)) return null;
  const created: unknown = time["created"];
  return typeof created === "number" && Number.isFinite(created) ? created : null;
}

function readTimeCompleted(record: Record<string, unknown>): number | null {
  const time: unknown = record["time"];
  if (!isRecord(time)) return null;
  const completed: unknown = time["completed"];
  return typeof completed === "number" && Number.isFinite(completed) ? completed : null;
}

/** `provider/model` label of a `ModelRef` (`{ providerID, modelID }`). */
function modelLabel(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (!isRecord(value)) return null;
  const providerID = readStringField(value, ["providerID", "providerId"]);
  const modelID = readStringField(value, ["modelID", "id"]);
  if (providerID !== null && modelID !== null) return `${providerID}/${modelID}`;
  return modelID ?? providerID;
}

interface MessageMeta {
  agent: string | null;
  model: string | null;
  durationMs: number | null;
}

const NO_META: MessageMeta = { agent: null, model: null, durationMs: null };

/** Agent/model the message itself declares plus its turn duration, if any. */
function readMessageMeta(entry: Record<string, unknown>): MessageMeta {
  const created = readTimeCreated(entry);
  const completed = readTimeCompleted(entry);
  const durationMs =
    created !== null && completed !== null && completed >= created ? completed - created : null;
  return {
    agent: readStringField(entry, ["agent"]),
    model: modelLabel(entry["model"]),
    durationMs,
  };
}

/** Fill the session meta every message carries into the chat chrome. */
function withMeta(base: Omit<ChatMessage, keyof MessageMeta>, entry?: Record<string, unknown>): ChatMessage {
  return { ...base, ...(entry === undefined ? NO_META : readMessageMeta(entry)) };
}

function excerpt(text: string, limit: number = MAX_PART_EXCERPT_CHARS): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

const TOOL_STATUSES: readonly ChatToolStatus[] = [
  "streaming",
  "running",
  "completed",
  "error",
  "unknown",
];

function toToolStatus(value: unknown): ChatToolStatus {
  return TOOL_STATUSES.includes(value as ChatToolStatus) ? (value as ChatToolStatus) : "unknown";
}

/** Display name of an attached/prompt file entry (`{ uri, name, path }`). */
function fileLabel(entry: unknown): string | null {
  if (typeof entry === "string" && entry !== "") return entry;
  if (!isRecord(entry)) return null;
  const name = readStringField(entry, ["name", "path"]);
  if (name !== null) return name;
  const uri = readStringField(entry, ["uri"]);
  if (uri === null) return null;
  const segment = uri.split("/").pop();
  return segment !== undefined && segment !== "" ? segment : uri;
}

function readFileLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const entry of value) {
    const label = fileLabel(entry);
    if (label !== null) labels.push(label);
  }
  return labels;
}

/** Short human detail of a finished tool call (error text, excerpt, file name). */
function toolDetail(state: Record<string, unknown>): string | null {
  const error: unknown = state["error"];
  if (isRecord(error)) {
    const message = readStringField(error, ["message"]);
    if (message !== null) return excerpt(message, 500);
  }
  const content: unknown = state["content"];
  if (!Array.isArray(content)) return null;
  const snippets: string[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    if (item["type"] === "text" && typeof item["text"] === "string" && item["text"] !== "") {
      snippets.push(item["text"]);
    } else if (item["type"] === "file") {
      const label = fileLabel(item);
      if (label !== null) snippets.push(label);
    }
  }
  if (snippets.length === 0) return null;
  return excerpt(snippets.join("\n"), 500);
}

/**
 * `state.input` of a tool call. The client sends a record
 * (`{ [x: string]: JsonValue }`) for every non-streaming state and a partial
 * JSON *string* while streaming — both are accepted, anything else degrades
 * to an empty argument set.
 */
function toolInput(state: Record<string, unknown>): Record<string, unknown> {
  const raw: unknown = state["input"];
  if (isRecord(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function toolMetadata(state: Record<string, unknown>): Record<string, unknown> | null {
  const raw: unknown = state["metadata"];
  return isRecord(raw) ? raw : null;
}

function parseToolPart(entry: Record<string, unknown>): ChatToolPart {
  // The original SDK reads `part.tool`; the pinned client types say `name`.
  const name = readStringField(entry, ["name", "tool", "title"]) ?? "tool";
  const state: unknown = entry["state"];
  const status = isRecord(state) ? toToolStatus(state["status"]) : "unknown";
  const detail =
    isRecord(state) && (status === "completed" || status === "error")
      ? toolDetail(state)
      : null;
  return {
    kind: "tool",
    name,
    status,
    detail,
    input: isRecord(state) ? toolInput(state) : {},
    metadata: isRecord(state) ? toolMetadata(state) : null,
  };
}

/** Map one assistant `content[]` entry to a part; null for unusable entries. */
function parseAssistantContent(entry: unknown): ChatPart | null {
  if (!isRecord(entry)) return null;
  const type = readStringField(entry, ["type"]);
  if (type === "text" || type === "reasoning") {
    const text = readStringField(entry, ["text"]);
    if (text === null) return null;
    return type === "text"
      ? { kind: "text", text: excerpt(text) }
      : { kind: "reasoning", text: excerpt(text) };
  }
  if (type === "tool") return parseToolPart(entry);
  if (type === "file" || type === "image") {
    const label = fileLabel(entry);
    return label === null ? { kind: "unknown" } : { kind: "files", files: [label] };
  }
  return { kind: "unknown" };
}

/**
 * Defensive mapping for `{ info, parts }`-style entries in case a future
 * server generation wraps messages that way: `info` carries the message
 * meta, `parts[]` the content. Unknown part types degrade to `unknown`.
 */
function parseInfoPartsEntry(
  info: Record<string, unknown>,
  parts: unknown[],
  id: string,
  created: number,
): ChatMessage {
  const role = readStringField(info, ["role"]);
  const type = readStringField(info, ["type"]);
  const mapped: ChatPart[] = [];
  for (const part of parts) {
    const parsed = parseAssistantContent(part);
    if (parsed !== null) mapped.push(parsed);
  }
  if (mapped.length === 0) mapped.push({ kind: "unknown" });
  if (role === "user" || (role === null && type === "user")) {
    return withMeta(
      {
        id,
        role: "user",
        noteKind: null,
        noteDetail: null,
        parts: mapped,
        text: textFallback(mapped),
        created,
      },
      info,
    );
  }
  if (role === "assistant" || (role === null && type === "assistant")) {
    return withMeta(
      {
        id,
        role: "assistant",
        noteKind: null,
        noteDetail: null,
        parts: mapped,
        text: textFallback(mapped),
        created,
      },
      info,
    );
  }
  return withMeta(
    {
      id,
      role: "note",
      noteKind: "unknown",
      noteDetail: type,
      parts: mapped,
      text: textFallback(mapped),
      created,
    },
    info,
  );
}

/** Plain-text fallback of parts for pickers and legacy displays. */
function textFallback(parts: ChatPart[]): string {
  const texts = parts
    .filter((part): part is ChatTextPart => part.kind === "text")
    .map((part) => part.text);
  if (texts.length > 0) return excerpt(texts.join("\n\n"), 500);
  const tools = parts
    .filter((part): part is ChatToolPart => part.kind === "tool")
    .map((part) => part.name);
  if (tools.length > 0) return tools.join(", ").slice(0, 200);
  const files = parts
    .filter((part): part is ChatFilesPart => part.kind === "files")
    .flatMap((part) => part.files);
  if (files.length > 0) return files.join(", ").slice(0, 200);
  return "";
}

function userMessage(
  entry: Record<string, unknown>,
  id: string,
  created: number,
): ChatMessage {
  // Legacy entries carry the prompt in `content`/`body` instead of `text`.
  const text = readStringField(entry, ["text", "content", "body"]) ?? "";
  const files = readFileLabels(entry["files"]);
  const parts: ChatPart[] = [];
  if (text !== "") parts.push({ kind: "text", text: excerpt(text) });
  if (files.length > 0) parts.push({ kind: "files", files });
  if (parts.length === 0) parts.push({ kind: "unknown" });
  const fallback = [text, files.join(", ")].filter((s) => s !== "").join("\n");
  return withMeta(
    {
      id,
      role: "user",
      noteKind: null,
      noteDetail: null,
      parts,
      text: excerpt(fallback, 500),
      created,
    },
    entry,
  );
}

function assistantMessage(
  entry: Record<string, unknown>,
  id: string,
  created: number,
): ChatMessage {
  const content: unknown = entry["content"];
  const parts: ChatPart[] = [];
  // Legacy entries carry the answer as a plain string instead of `content[]`.
  if (typeof content === "string" && content !== "") {
    parts.push({ kind: "text", text: excerpt(content) });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      const parsed = parseAssistantContent(item);
      if (parsed !== null) parts.push(parsed);
    }
  } else {
    const fallback = readStringField(entry, ["text", "body"]);
    if (fallback !== null) parts.push({ kind: "text", text: excerpt(fallback) });
  }
  if (parts.length === 0) parts.push({ kind: "unknown" });
  return withMeta(
    {
      id,
      role: "assistant",
      noteKind: null,
      noteDetail: null,
      parts,
      text: textFallback(parts),
      created,
    },
    entry,
  );
}

function noteMessage(
  id: string,
  created: number,
  noteKind: ChatNoteKind,
  body: string | null,
  noteDetail: string | null = null,
  entry?: Record<string, unknown>,
): ChatMessage {
  // Status notes without a body (idle outcomes, contentless compactions)
  // are bare status lines: they carry zero parts and must never degrade to
  // an `unknown` part — the "unknown content" fallback is reserved for
  // truly foreign message types (`noteKind: "unknown"`).
  const parts: ChatPart[] =
    body !== null && body !== ""
      ? [{ kind: "text", text: excerpt(body) }]
      : noteKind === "unknown"
        ? [{ kind: "unknown" }]
        : [];
  return withMeta(
    {
      id,
      role: "note",
      noteKind,
      noteDetail,
      parts,
      text: body === null ? "" : excerpt(body, 500),
      created,
    },
    entry,
  );
}

function shellSummary(entry: Record<string, unknown>): { summary: string; output: string | null } {
  const command = readStringField(entry, ["command"]) ?? "";
  const status = readStringField(entry, ["status"]) ?? "";
  const exit: unknown = entry["exit"];
  const exitLabel = typeof exit === "number" ? `, Code ${exit}` : "";
  const summary = command === "" ? status : `$ ${command} (${status}${exitLabel})`;
  const outputRaw: unknown = entry["output"];
  let output: string | null = null;
  if (isRecord(outputRaw) && typeof outputRaw["output"] === "string" && outputRaw["output"] !== "") {
    output = outputRaw["output"];
  }
  return { summary, output };
}

function parseEntry(entry: unknown, index: number, total: number, now: number): ChatMessage | null {
  const fallbackCreated = now - (total - 1 - index);
  if (!isRecord(entry)) {
    // Bare primitives carry no structure: show the plain value as a note,
    // never a JSON dump of an object.
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      const body = excerpt(String(entry), 500);
      return {
        id: `nachricht-${index}`,
        role: "note",
        noteKind: "unknown",
        noteDetail: null,
        parts: [{ kind: "text", text: body }],
        text: body,
        created: fallbackCreated,
        ...NO_META,
      };
    }
    return {
      id: `nachricht-${index}`,
      role: "note",
      noteKind: "unknown",
      noteDetail: null,
      parts: [{ kind: "unknown" }],
      text: "",
      created: fallbackCreated,
      ...NO_META,
    };
  }
  const id = readStringField(entry, ["id", "messageID", "messageId"]) ?? `nachricht-${index}`;
  const created = readTimeCreated(entry) ?? fallbackCreated;
  const type = readStringField(entry, ["type"]);

  // Future-proof `{ info, parts }` envelope (tolerated, not required).
  // The meta lives in `info`, so id and timestamp prefer it as well.
  const info: unknown = entry["info"];
  const wrappedParts: unknown = entry["parts"];
  if (isRecord(info) && Array.isArray(wrappedParts)) {
    const infoID = readStringField(info, ["id", "messageID", "messageId"]) ?? id;
    const infoCreated = readTimeCreated(info) ?? created;
    return parseInfoPartsEntry(info, wrappedParts, infoID, infoCreated);
  }

  switch (type) {
    case "user":
      return userMessage(entry, id, created);
    case "assistant":
      return assistantMessage(entry, id, created);
    case "system":
      return noteMessage(
        id,
        created,
        "system",
        readStringField(entry, ["text", "description"]),
        null,
        entry,
      );
    case "synthetic":
      return noteMessage(
        id,
        created,
        "synthetic",
        readStringField(entry, ["text", "description"]),
        null,
        entry,
      );
    case "skill": {
      const text = readStringField(entry, ["text"]);
      const name = readStringField(entry, ["name", "skill"]);
      const body = [name === null ? null : name, text].filter((s) => s !== null).join(": ");
      return noteMessage(id, created, "skill", body === "" ? null : body, null, entry);
    }
    case "shell": {
      const { summary, output } = shellSummary(entry);
      const parts: ChatPart[] = [{ kind: "text", text: excerpt(summary, 500) }];
      if (output !== null) parts.push({ kind: "text", text: excerpt(output) });
      return withMeta(
        {
          id,
          role: "note",
          noteKind: "shell",
          noteDetail: readStringField(entry, ["status"]),
          parts,
          text: excerpt(summary, 500),
          created,
        },
        entry,
      );
    }
    case "compaction": {
      const status = readStringField(entry, ["status"]);
      const summary = readStringField(entry, ["summary", "recent", "text"]);
      const error: unknown = entry["error"];
      const errorText = isRecord(error) ? readStringField(error, ["message"]) : null;
      return noteMessage(id, created, "compaction", summary ?? errorText, status, entry);
    }
    case "idle":
      return noteMessage(id, created, "idle", null, readStringField(entry, ["outcome"]), entry);
    // Real union discriminators (`SessionMessageAgentSelected` /
    // `SessionMessageModelSelected` in the pinned client). The legacy
    // spellings stay tolerated aliases (old mocks / old cache rows).
    case "agent-switched":
    case "agent-selected":
      return noteMessage(
        id,
        created,
        "agent",
        readStringField(entry, ["agent", "name"]),
        readStringField(entry, ["previous"]),
        entry,
      );
    case "model-switched":
    case "model-selected":
      return noteMessage(id, created, "model", modelLabel(entry["model"]), null, entry);
    case "location-switched": {
      // The directory lives under `location` on real payloads; older shapes
      // carried a flat `projectID`/`subpath` pair, so both are tolerated.
      const location: unknown = entry["location"];
      const label = isRecord(location)
        ? readStringField(location, ["directory", "path", "subpath"])
        : readStringField(entry, ["projectID", "directory", "path"]);
      return noteMessage(id, created, "location", label, null, entry);
    }
    case null: {
      // Legacy `{ id, role, text }` entries (old mocks / old cache rows).
      const role = readStringField(entry, ["role"]);
      if (role === "user") return userMessage(entry, id, created);
      if (role === "assistant") return assistantMessage(entry, id, created);
      const text = readStringField(entry, ["text", "content", "body"]);
      return noteMessage(id, created, "unknown", text, role, entry);
    }
    default:
      return noteMessage(
        id,
        created,
        "unknown",
        readStringField(entry, ["text", "description", "content", "body"]),
        type,
        entry,
      );
  }
}

/**
 * Normalize a `message.list` payload (`{ data: [...] }`, `{ messages: [...] }`
 * or a plain array) into chat messages, oldest first. `created` preserves the
 * payload order when the server sent no timestamps: the last entry counts as
 * the newest.
 */
export function parseSessionMessages(value: unknown, now: number = Date.now()): ChatMessage[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (isRecord(value)) {
    if (Array.isArray(value["data"])) list = value["data"] as unknown[];
    else if (Array.isArray(value["messages"])) list = value["messages"] as unknown[];
  }
  const total = list.length;
  const messages: ChatMessage[] = [];
  list.forEach((entry, index) => {
    const parsed = parseEntry(entry, index, total, now);
    if (parsed !== null) messages.push(parsed);
  });
  // Chat chrome shows `agent · model` per message; only some union members
  // carry it (assistant, switch notes), so every other message inherits the
  // last one seen in the session — the switch note updates it for the rest
  // of the conversation.
  let agent: string | null = null;
  let model: string | null = null;
  for (const message of messages) {
    if (message.agent !== null) agent = message.agent;
    if (message.model !== null) model = message.model;
    if (message.agent === null) message.agent = agent;
    if (message.model === null) message.model = model;
  }
  return messages;
}

/** Humanized timestamp of a message in German locale (day.month, hour:minute). */
export function formatChatTime(created: number): string {
  if (!Number.isFinite(created)) return "";
  return new Date(created).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
