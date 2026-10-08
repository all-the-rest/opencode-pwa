/**
 * Cache-first message storage for session messages.
 *
 * Each message is stored under the key `serverID:sessionID:messageID`.
 * Per session only the newest MAX_MESSAGES_PER_SESSION entries are kept;
 * older entries are evicted on write and on merge.
 *
 * Storage is a tiny IndexedDB wrapper (object store `messages` with a
 * `bySession` index). When IndexedDB is unavailable (private mode, jsdom
 * tests) a module-local in-memory map is used instead, so callers never
 * have to branch.
 */

import {
  parseSessionMessages,
  type ChatNoteKind,
  type ChatPart,
} from "./sessionMessages.ts";

export interface MessageInput {
  id: string;
  role: string;
  text: string;
  created?: number;
  noteKind?: ChatNoteKind | null;
  noteDetail?: string | null;
  parts?: ChatPart[];
}

export interface CachedMessage {
  key: string;
  sessionKey: string;
  serverID: string;
  sessionID: string;
  messageID: string;
  role: string;
  text: string;
  created: number;
  noteKind: ChatNoteKind | null;
  noteDetail: string | null;
  parts: ChatPart[];
}

/** Newest ~200 messages per session are kept, older ones are evicted. */
export const MAX_MESSAGES_PER_SESSION = 200;

const DB_NAME = "opencode-pwa-message-cache";
const STORE_NAME = "messages";
const INDEX_SESSION = "bySession";
const DB_VERSION = 1;

export function cacheKey(serverID: string, sessionID: string, messageID: string): string {
  return `${serverID}:${sessionID}:${messageID}`;
}

export function sessionCacheKey(serverID: string, sessionID: string): string {
  return `${serverID}:${sessionID}`;
}

/**
 * Normalize a `message.list` payload into message inputs. Parsing follows
 * the real V2 shapes (`sessionMessages.ts`: user/assistant/notes); `created`
 * preserves the payload order when the server sent no timestamps — the last
 * entry counts as the newest.
 */
export function extractMessageInputs(value: unknown, now: number = Date.now()): MessageInput[] {
  return parseSessionMessages(value, now).map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    created: message.created,
    noteKind: message.noteKind,
    noteDetail: message.noteDetail,
    parts: message.parts,
  }));
}

export function toCachedMessages(
  serverID: string,
  sessionID: string,
  inputs: MessageInput[],
  now: number = Date.now(),
): CachedMessage[] {
  const total = inputs.length;
  return inputs.map((input, index) => ({
    key: cacheKey(serverID, sessionID, input.id),
    sessionKey: sessionCacheKey(serverID, sessionID),
    serverID,
    sessionID,
    messageID: input.id,
    role: input.role,
    text: input.text,
    created: input.created ?? now - (total - 1 - index),
    noteKind: input.noteKind ?? null,
    noteDetail: input.noteDetail ?? null,
    parts: input.parts ?? [],
  }));
}

function compareNewestFirst(a: CachedMessage, b: CachedMessage): number {
  if (b.created !== a.created) return b.created - a.created;
  return a.messageID.localeCompare(b.messageID);
}

/**
 * Migrate rows written by older app versions: they carry no `parts` (and
 * `role: "unbekannt"` rows may hold a raw JSON dump as text). Part-less rows
 * get an empty part list (the view falls back to the plain text), and text
 * that is visibly a JSON object dump is dropped so it never renders again.
 */
export function normalizeCachedRow(row: CachedMessage): CachedMessage {
  const rawParts: unknown = (row as { parts?: unknown }).parts;
  const parts = Array.isArray(rawParts) ? (rawParts as ChatPart[]) : [];
  // Fresh parses always carry at least one part, so a part-less row with
  // JSON-object text is unambiguously a legacy dump — drop the text so it
  // never renders again.
  const text = typeof row.text === "string" ? row.text : "";
  const trimmed = text.trim();
  const dumped = parts.length === 0 && trimmed.startsWith("{") && trimmed.endsWith("}");
  if (Array.isArray(rawParts) && !dumped && row.noteKind !== undefined) return row;
  return {
    ...row,
    text: dumped ? "" : text,
    noteKind: row.noteKind ?? null,
    noteDetail: row.noteDetail ?? null,
    parts,
  };
}

/** Newest first. */
export function sortNewestFirst(list: CachedMessage[]): CachedMessage[] {
  return [...list].sort(compareNewestFirst);
}

/** Keep the newest `limit` entries, drop the rest. */
export function evictOldest(
  list: CachedMessage[],
  limit: number = MAX_MESSAGES_PER_SESSION,
): CachedMessage[] {
  if (limit <= 0) return [];
  return sortNewestFirst(list).slice(0, limit);
}

/**
 * Merge cached and freshly fetched/live messages. Entries from `incoming`
 * win on conflicting IDs; the result is newest-first and capped.
 */
export function mergeMessageLists(
  cached: CachedMessage[],
  incoming: CachedMessage[],
  limit: number = MAX_MESSAGES_PER_SESSION,
): CachedMessage[] {
  const byId = new Map<string, CachedMessage>();
  for (const message of cached) byId.set(message.messageID, message);
  for (const message of incoming) byId.set(message.messageID, message);
  return evictOldest([...byId.values()], limit);
}

function indexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!indexedDBAvailable()) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex(INDEX_SESSION, "sessionKey", { unique: false });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        resolve(null);
      };
      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

const memoryStore = new Map<string, CachedMessage>();

function evictMemorySession(sessionKey: string): void {
  const kept = evictOldest(
    [...memoryStore.values()].filter((message) => message.sessionKey === sessionKey),
  );
  const keepKeys = new Set(kept.map((message) => message.key));
  for (const message of [...memoryStore.values()]) {
    if (message.sessionKey === sessionKey && !keepKeys.has(message.key)) {
      memoryStore.delete(message.key);
    }
  }
}

export async function putMessages(
  serverID: string,
  sessionID: string,
  inputs: MessageInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  const sessionKey = sessionCacheKey(serverID, sessionID);
  const rows = toCachedMessages(serverID, sessionID, inputs);
  const db = await openDatabase();
  if (db === null) {
    for (const row of rows) memoryStore.set(row.key, row);
    evictMemorySession(sessionKey);
    return;
  }
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const row of rows) {
    await requestToPromise(store.put(row));
  }
  const index = store.index(INDEX_SESSION);
  const existing = (await requestToPromise(
    index.getAll(sessionKey),
  )) as CachedMessage[];
  const keepKeys = new Set(evictOldest(existing).map((message) => message.key));
  for (const message of existing) {
    if (!keepKeys.has(message.key)) {
      await requestToPromise(store.delete(message.key));
    }
  }
}

/** Newest first. */
export async function readMessages(serverID: string, sessionID: string): Promise<CachedMessage[]> {
  const sessionKey = sessionCacheKey(serverID, sessionID);
  const db = await openDatabase();
  if (db === null) {
    return sortNewestFirst(
      [...memoryStore.values()]
        .filter((message) => message.sessionKey === sessionKey)
        .map(normalizeCachedRow),
    );
  }
  const tx = db.transaction(STORE_NAME, "readonly");
  const index = tx.objectStore(STORE_NAME).index(INDEX_SESSION);
  const rows = (
    (await requestToPromise(index.getAll(sessionKey))) as CachedMessage[]
  ).map(normalizeCachedRow);
  return sortNewestFirst(rows);
}

export async function clearSessionMessages(serverID: string, sessionID: string): Promise<void> {
  const sessionKey = sessionCacheKey(serverID, sessionID);
  for (const message of [...memoryStore.values()]) {
    if (message.sessionKey === sessionKey) memoryStore.delete(message.key);
  }
  const db = await openDatabase();
  if (db === null) return;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index(INDEX_SESSION);
  const existing = (await requestToPromise(index.getAll(sessionKey))) as CachedMessage[];
  for (const message of existing) {
    await requestToPromise(store.delete(message.key));
  }
}

/** Test-only helper: drop all in-memory entries (used when IndexedDB is absent). */
export function clearMemoryCacheForTests(): void {
  memoryStore.clear();
}
