/**
 * Extract session messages from raw V2 events so live events can be merged
 * into the IndexedDB message cache (`messageCache.ts`). Shapes follow the
 * real `SessionMessageInfo` union (`sessionMessages.ts`); streaming deltas
 * and non-message events return null.
 */

import {
  parseSessionMessages,
  type ChatNoteKind,
  type ChatPart,
} from "./sessionMessages.ts";

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
