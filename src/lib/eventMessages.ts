/**
 * Extract session messages from raw V2 events so live events can be merged
 * into the IndexedDB message cache (`messageCache.ts`). Shapes follow the
 * real `SessionMessageInfo` union (`sessionMessages.ts`).
 *
 * Two live paths meet here:
 *
 * - **Snapshots** (`session.message.content.updated`) carry a whole assistant
 *   message; `extractContentUpdateMessage` parses it through the V2 parser.
 * - **Deltas** (`session.text.delta`, `session.reasoning.delta`,
 *   `session.tool.input.delta`) carry a single fragment in high frequency and
 *   are folded into the in-memory model by `foldStreamDelta`. A measured live
 *   stream produced 92 reasoning frames in 12 seconds with *no*
 *   `content.updated` at all — so without the fold the UI showed the working
 *   row and then the finished message, but never the reasoning while it grew.
 *
 * Deltas are never persisted: a half-streamed row is not a final message, and
 * `downgradePartialToolStatus` drops `live` parts on the way to the cache
 * anyway. The authoritative refresh (`content.updated` / `message.list`)
 * replaces a streamed row wholesale.
 */

import {
  parseSessionMessages,
  textFallback,
  toolInput,
  type ChatNoteKind,
  type ChatPart,
  type ChatReasoningPart,
  type ChatTextPart,
} from "./sessionMessages.ts";
import { cacheKey, sessionCacheKey, type CachedMessage } from "./messageCache.ts";

export interface EventMessage {
  sessionID: string;
  messageID: string;
  role: string;
  text: string;
  created: number;
  noteKind: ChatNoteKind | null;
  noteDetail: string | null;
  parts: ChatPart[];
  agent: string | null;
  model: string | null;
  durationMs: number | null;
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

/** The `session.message.content.updated` event type (streaming assistant turns). */
export const CONTENT_UPDATED_EVENT = "session.message.content.updated";

/**
 * Agent/model of a session, carried into streaming snapshots that declare
 * neither (the event payload only repeats the content array).
 */
export interface SessionMetaFallback {
  agent: string | null;
  model: string | null;
}

/** A part a text/reasoning delta can grow. */
type ChatTextLike = ChatTextPart | ChatReasoningPart;

/** Agent/model of the newest message that declares one, else empty meta. */
export function latestSessionMeta(
  messages: readonly { agent: string | null; model: string | null }[],
): SessionMetaFallback {
  for (const message of messages) {
    if (message.agent !== null || message.model !== null) {
      return { agent: message.agent, model: message.model };
    }
  }
  return { agent: null, model: null };
}

export function readEventType(event: unknown): string | null {
  if (event === null || typeof event !== "object") return null;
  return readStringField(event as Record<string, unknown>, ["type"]);
}

/** Top-level `created` timestamp of an event (ms), or null when absent. */
function readEventCreated(event: unknown): number | null {
  if (event === null || typeof event !== "object") return null;
  const created: unknown = (event as Record<string, unknown>)["created"];
  return typeof created === "number" && Number.isFinite(created) ? created : null;
}

/** Full (unsliced) session id of an event, or null when absent. */
export function readEventSessionID(event: unknown): string | null {
  if (event === null || typeof event !== "object") return null;
  const root = event as Record<string, unknown>;
  const direct = readStringField(root, ["sessionID", "sessionId"]);
  if (direct !== null) return direct;
  const data: unknown = root["data"];
  if (data === null || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  const fromData = readStringField(dataRecord, ["sessionID", "sessionId"]);
  if (fromData !== null) return fromData;
  const nested: unknown = dataRecord["message"];
  if (nested === null || typeof nested !== "object") return null;
  return readStringField(nested as Record<string, unknown>, ["sessionID", "sessionId"]);
}

function readMessageCandidate(event: unknown): Record<string, unknown> | null {
  if (event === null || typeof event !== "object") return null;
  const root = event as Record<string, unknown>;
  const data: unknown = root["data"];
  if (data !== null && typeof data === "object") {
    const dataRecord = data as Record<string, unknown>;
    const nested: unknown = dataRecord["message"];
    if (nested !== null && typeof nested === "object") {
      return nested as Record<string, unknown>;
    }
    if (
      typeof dataRecord["id"] === "string" ||
      typeof dataRecord["messageID"] === "string" ||
      typeof dataRecord["messageId"] === "string"
    ) {
      return dataRecord;
    }
  }
  const direct: unknown = root["message"];
  if (direct !== null && typeof direct === "object") {
    return direct as Record<string, unknown>;
  }
  return null;
}

/**
 * Pull a session message out of a raw event. Returns null for non-message
 * events (status, compaction, permission, streaming deltas) and for malformed
 * payloads without session or message id.
 *
 * `session.message.content.updated` is deliberately excluded here: its `data`
 * carries `messageID` (so the generic path would treat it as a message) but no
 * `type`, which used to mis-parse it into an "Unbekannter Inhalt" note that then
 * got persisted as if final. It is handled by `extractContentUpdateMessage`
 * instead and never falls through to the note builder.
 */
export function extractMessageFromEvent(event: unknown, now: number = Date.now()): EventMessage | null {
  if (readEventType(event) === CONTENT_UPDATED_EVENT) return null;
  const sessionID = readEventSessionID(event);
  if (sessionID === null) return null;
  const candidate = readMessageCandidate(event);
  if (candidate === null) return null;
  if (readStringField(candidate, ["id", "messageID", "messageId"]) === null) return null;
  // Parse through the shared V2 parser so live notes (idle/compaction) and
  // tool parts render exactly like fetched messages — never as JSON dumps.
  const parsed = parseSessionMessages([candidate], now)[0];
  if (parsed === undefined) return null;
  return {
    sessionID,
    messageID: parsed.id,
    role: parsed.role,
    text: parsed.text,
    created: parsed.created,
    noteKind: parsed.noteKind,
    noteDetail: parsed.noteDetail,
    parts: parsed.parts,
    agent: parsed.agent,
    model: parsed.model,
    durationMs: parsed.durationMs,
  };
}

/**
 * Extract an assistant message snapshot from a `session.message.content.updated`
 * event so live streaming renders through the same V2 parser as fetched
 * messages. Shape (verified in the installed client):
 *   `data: { sessionID, messageID, content: SessionMessageAssistantContentEncoded[] }`
 * where `content` is the same `text`/`reasoning`/`tool` union an assistant
 * message carries. Returns null for non-content-update events, missing ids, or
 * an empty `content` array (the working indicator covers the "no parts yet"
 * gap, so an empty snapshot must not create a bogus message).
 *
 * The message is keyed by `data.messageID`; the caller merges it into the cache
 * so repeated snapshots for the same id simply grow the assistant text.
 *
 * `fallback` carries the session's current agent/model from the previous turn
 * (the last message that declared them). Snapshots declare neither, so without
 * it the streaming bubble's `agent · model` header stays empty until the full
 * message arrives from `message.list`.
 */
export function extractContentUpdateMessage(
  event: unknown,
  now: number = Date.now(),
  fallback?: SessionMetaFallback,
): EventMessage | null {
  if (readEventType(event) !== CONTENT_UPDATED_EVENT) return null;
  if (event === null || typeof event !== "object") return null;
  const data: unknown = (event as Record<string, unknown>)["data"];
  if (data === null || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  const sessionID = readStringField(dataRecord, ["sessionID", "sessionId"]);
  const messageID = readStringField(dataRecord, ["messageID", "messageId"]);
  if (sessionID === null || messageID === null) return null;
  const content: unknown = dataRecord["content"];
  if (!Array.isArray(content) || content.length === 0) return null;
  // Reuse the assistant-message builder: it maps `content[]` through the exact
  // same part parser as `message.list`, so text/reasoning/tool parts live-render
  // identically. `created` falls back to the event's own timestamp; `agent` /
  // `model` pass through when the snapshot carries them.
  const agent = readStringField(dataRecord, ["agent"]);
  const synthetic = {
    type: "assistant",
    id: messageID,
    content,
    time: { created: readEventCreated(event) ?? now },
    ...(agent !== null ? { agent } : {}),
    ...(dataRecord["model"] !== undefined ? { model: dataRecord["model"] } : {}),
  };
  const parsed = parseSessionMessages([synthetic], now)[0];
  if (parsed === undefined || parsed.role !== "assistant") return null;
  // A snapshot whose only parts degrade to `unknown` carries no real content —
  // skip it so the working indicator keeps covering the gap.
  if (parsed.parts.length === 1 && parsed.parts[0]?.kind === "unknown") return null;
  return {
    sessionID,
    messageID: parsed.id,
    role: parsed.role,
    text: parsed.text,
    created: parsed.created,
    noteKind: parsed.noteKind,
    noteDetail: parsed.noteDetail,
    parts: parsed.parts,
    agent: parsed.agent ?? fallback?.agent ?? null,
    model: parsed.model ?? fallback?.model ?? null,
    durationMs: parsed.durationMs,
  };
}

// ---------------------------------------------------------------------------
// Streaming deltas
//
// Payloads verified in the installed client
// (`node_modules/@opencode/client/dist/promise/generated/types.d.ts`):
//
//   SessionTextDelta      lines 1506-1520 — `session.text.delta`
//   SessionReasoningDelta lines 1521-1535 — `session.reasoning.delta`
//     data: { sessionID, assistantMessageID, ordinal, delta }
//   SessionToolInputDelta lines 1536-1550 — `session.tool.input.delta`
//     data: { sessionID, assistantMessageID, id, delta }
//
// The two content deltas address a part by its `ordinal` (the index inside the
// assistant message's `content[]`); the tool-input delta addresses the call by
// its `id` and carries an *argument fragment*, not text.
// ---------------------------------------------------------------------------

export const TEXT_DELTA_EVENT = "session.text.delta";
export const REASONING_DELTA_EVENT = "session.reasoning.delta";
export const TOOL_INPUT_DELTA_EVENT = "session.tool.input.delta";

/** Which stream a delta frame grows: answer text, reasoning, or tool arguments. */
export type StreamDeltaKind = "text" | "reasoning" | "tool-input";

/** One `session.*.delta` frame, normalized for the fold. */
export interface StreamDelta {
  kind: StreamDeltaKind;
  sessionID: string;
  /** Assistant message the frame belongs to (`data.assistantMessageID`). */
  messageID: string;
  /** Part index inside the message's `content[]`; null for tool input. */
  ordinal: number | null;
  /** Call id (`data.id`) of the tool; null unless `kind === "tool-input"`. */
  callID: string | null;
  /** The fragment to append. */
  delta: string;
  /** Top-level `created` of the event (ms), or null when it carries none. */
  created: number | null;
}

function readDeltaKind(type: string): StreamDeltaKind | null {
  if (type === TEXT_DELTA_EVENT) return "text";
  if (type === REASONING_DELTA_EVENT) return "reasoning";
  if (type === TOOL_INPUT_DELTA_EVENT) return "tool-input";
  return null;
}

/**
 * Fold one raw `session.*.delta` frame into a `StreamDelta`, or null for any
 * other event and for frames without session, assistant message or fragment.
 */
export function extractStreamDelta(event: unknown): StreamDelta | null {
  const kind = readDeltaKind(readEventType(event) ?? "");
  if (kind === null) return null;
  if (event === null || typeof event !== "object") return null;
  const data: unknown = (event as Record<string, unknown>)["data"];
  if (data === null || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  const sessionID = readStringField(dataRecord, ["sessionID", "sessionId"]);
  const messageID = readStringField(dataRecord, ["assistantMessageID", "assistantMessageId"]);
  const delta = readStringField(dataRecord, ["delta"]);
  if (sessionID === null || messageID === null || delta === null) return null;
  if (kind === "tool-input") {
    // No ordinal here: the frame names the tool call, not a part index.
    return {
      kind,
      sessionID,
      messageID,
      ordinal: null,
      callID: readStringField(dataRecord, ["id", "callID", "callId"]),
      delta,
      created: readEventCreated(event),
    };
  }
  const ordinal: unknown = dataRecord["ordinal"];
  if (typeof ordinal !== "number" || !Number.isInteger(ordinal) || ordinal < 0) return null;
  return {
    kind,
    sessionID,
    messageID,
    ordinal,
    callID: null,
    delta,
    created: readEventCreated(event),
  };
}

/** Session identity plus the agent/model a new streamed row may inherit. */
export interface StreamFoldContext {
  /** Server id of the rows (part of the cache key of a new row). */
  serverID: string;
  /** Agent/model the session last declared; unknown fields stay null. */
  meta?: SessionMetaFallback;
  /** `now` for tests and deterministic snapshots; defaults to `Date.now()`. */
  now?: number;
}

/**
 * Fold one delta frame into the in-memory chat model (newest first, as
 * `useSessionMessages` keeps `all`).
 *
 * Pure and identity-preserving: untouched rows keep their object identity, so
 * a frame re-renders only the row it actually grew (the rows are keyed by
 * message id). The returned array is `rows` itself when the frame changes
 * nothing — the caller can hand that straight to `setState`, which bails out.
 *
 * A delta for a message with no row yet creates a placeholder: the stream
 * names the assistant message id before any snapshot (`content.updated` /
 * `message.list`) carries its content, so without a row the fragment would
 * have nowhere to land. `agent`/`model` are unknown at that point and stay
 * null unless `context.meta` fills them.
 */
export function foldStreamDelta(
  rows: CachedMessage[],
  delta: StreamDelta,
  context: StreamFoldContext,
): CachedMessage[] {
  const index = rows.findIndex((row) => row.messageID === delta.messageID);
  if (index < 0) {
    if (delta.kind === "tool-input") {
      // Neither the row nor the tool card it names exists yet, so there is
      // nothing to accumulate into. The snapshot that announces the call
      // carries its full arguments, so dropping the fragment loses nothing.
      return rows;
    }
    const streamed = createStreamRow(delta, context);
    // Newest first: a streamed message is the one being written right now, so
    // it belongs above everything older than it (an event timestamp that
    // predates the last message must not disturb the order).
    let at = 0;
    while (at < rows.length && (rows[at]?.created ?? 0) > streamed.created) at += 1;
    const next = rows.slice();
    next.splice(at, 0, streamed);
    return next;
  }
  const row = rows[index];
  if (row === undefined) return rows;
  const parts = foldDeltaIntoParts(row.parts, delta);
  if (parts === row.parts) return rows;
  const next = rows.slice();
  next[index] = { ...row, parts, text: textFallback(parts) };
  return next;
}

/** Placeholder row for a delta that names a message the chat model lacks. */
function createStreamRow(delta: StreamDelta, context: StreamFoldContext): CachedMessage {
  const parts: ChatPart[] = [
    delta.kind === "reasoning"
      ? { kind: "reasoning", text: delta.delta, live: true }
      : { kind: "text", text: delta.delta, live: true },
  ];
  return {
    key: cacheKey(context.serverID, delta.sessionID, delta.messageID),
    sessionKey: sessionCacheKey(context.serverID, delta.sessionID),
    serverID: context.serverID,
    sessionID: delta.sessionID,
    messageID: delta.messageID,
    role: "assistant",
    text: textFallback(parts),
    created: delta.created ?? context.now ?? Date.now(),
    noteKind: null,
    noteDetail: null,
    parts,
    agent: context.meta?.agent ?? null,
    model: context.meta?.model ?? null,
    durationMs: null,
  };
}

/**
 * Append a text/reasoning fragment to the part at that ordinal. Returns null
 * when the part is not there yet, or when it holds a different kind (see the
 * caller for why the snapshot wins in that case).
 */
function appendToPart(
  existing: ChatPart | undefined,
  kind: "text" | "reasoning",
  fragment: string,
): ChatTextLike | null {
  if (kind === "text" && existing?.kind === "text") {
    return { ...existing, text: `${existing.text}${fragment}`, live: true };
  }
  if (kind === "reasoning" && existing?.kind === "reasoning") {
    return { ...existing, text: `${existing.text}${fragment}`, live: true };
  }
  return null;
}

/**
 * Fold one delta frame into a message's parts. Pure: neither the array nor its
 * parts are mutated. Returns `parts` itself when the frame changes nothing, so
 * callers can skip the update (and the re-render) entirely.
 *
 * `ordinal` is the index inside the assistant message's `content[]`, so a text
 * delta and a reasoning delta address *different* slots of the same message.
 */
export function foldDeltaIntoParts(parts: ChatPart[], delta: StreamDelta): ChatPart[] {
  if (delta.kind === "tool-input") {
    if (delta.callID === null) return parts;
    let changed = false;
    const next = parts.map((part) => {
      if (part.kind !== "tool" || part.id !== delta.callID) return part;
      changed = true;
      // Accumulate the raw argument string and re-parse it through the
      // parser's own `toolInput`: while the JSON is still incomplete it
      // degrades to `{}`, exactly like a snapshot that carries a partial
      // string. No second parser, no duplicated JSON handling.
      const rawInput = `${part.rawInput ?? ""}${delta.delta}`;
      return { ...part, rawInput, input: toolInput({ input: rawInput }) };
    });
    return changed ? next : parts;
  }
  const ordinal = delta.ordinal;
  if (ordinal === null) return parts;
  const existing = parts[ordinal];
  const appended = appendToPart(existing, delta.kind, delta.delta);
  if (appended !== null) {
    const next = parts.slice();
    next[ordinal] = appended;
    return next;
  }
  if (existing !== undefined) {
    // The row came from an authoritative snapshot and holds a different kind
    // at this ordinal. The snapshot wins: overwriting it would destroy a part
    // the server really sent, and the next snapshot repairs the slot anyway.
    return parts;
  }
  // Nothing at this ordinal yet: create the part. A gap is padded with neutral
  // parts so the array index stays the ordinal (never a sparse array).
  const extended = parts.slice();
  while (extended.length < ordinal) extended.push({ kind: "unknown" });
  extended.push(
    delta.kind === "text"
      ? { kind: "text", text: delta.delta, live: true }
      : { kind: "reasoning", text: delta.delta, live: true },
  );
  return extended;
}
