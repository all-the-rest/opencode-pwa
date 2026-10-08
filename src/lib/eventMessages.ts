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
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

export function readEventType(event: unknown): string | null {
  if (event === null || typeof event !== "object") return null;
  return readStringField(event as Record<string, unknown>, ["type"]);
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
 */
export function extractMessageFromEvent(event: unknown, now: number = Date.now()): EventMessage | null {
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
  };
}
