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

export interface MessageInput {
  id: string;
  role: string;
  text: string;
  created?: number;
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

function readStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

/**
 * Normalize a `message.list` payload (`{ data: [...] }`, `{ messages: [...] }`
 * or a plain array) into message inputs. `created` preserves the payload
 * order: the last entry counts as the newest.
 */
export function extractMessageInputs(value: unknown, now: number = Date.now()): MessageInput[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (value !== null && typeof value === "object") {
    const record = value as { data?: unknown; messages?: unknown };
    if (Array.isArray(record.data)) list = record.data;
    else if (Array.isArray(record.messages)) list = record.messages;
  }
  const total = list.length;
  return list.map((entry, index) => {
    const created = now - (total - 1 - index);
    if (entry !== null && typeof entry === "object") {
      const item = entry as Record<string, unknown>;
      const id = readStringField(item, ["id", "messageID", "messageId"]) ?? `nachricht-${index}`;
      const role = readStringField(item, ["role"]) ?? "unbekannt";
      const text =
        readStringField(item, ["text", "content", "body"]) ?? JSON.stringify(item).slice(0, 500);
      return { id, role, text, created };
    }
    return { id: `nachricht-${index}`, role: "unbekannt", text: String(entry), created };
  });
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
  }));
}

function compareNewestFirst(a: CachedMessage, b: CachedMessage): number {
  if (b.created !== a.created) return b.created - a.created;
  return a.messageID.localeCompare(b.messageID);
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
      [...memoryStore.values()].filter((message) => message.sessionKey === sessionKey),
    );
  }
  const tx = db.transaction(STORE_NAME, "readonly");
  const index = tx.objectStore(STORE_NAME).index(INDEX_SESSION);
  const rows = (await requestToPromise(index.getAll(sessionKey))) as CachedMessage[];
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
