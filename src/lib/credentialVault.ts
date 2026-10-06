/**
 * Credential vault for server passwords.
 *
 * Invariant: a password is NEVER written to `localStorage` (or any other
 * plaintext store). `opencode-pwa:servers` keeps id/name/baseUrl/username only.
 *
 * Layout:
 *  - One random data encryption key (DEK) per browser install. It lives in
 *    IndexedDB as a non-extractable `CryptoKey` (AES-GCM 256), so it can be
 *    used for encryption but never read back out of the vault by script. It is
 *    created lazily on the first seal, so an install without any password
 *    never touches WebCrypto or IndexedDB.
 *  - Every password is sealed with its own random 96-bit IV. IV and ciphertext
 *    are stored next to each other in IndexedDB.
 *
 * Fallback: without WebCrypto or IndexedDB the credentials live in a
 * module-local map for the current session only — they are never persisted.
 * Settings shows a German notice in that case, and a reload asks for the
 * password again.
 */

/** Where credentials currently live. */
export type VaultMode = "persistent" | "memory";

export interface EncryptedSecret {
  /** Fresh 96-bit AES-GCM IV, unique per entry. */
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export interface VaultState {
  /** The install-wide DEK, or `null` when the vault has none yet. */
  key: CryptoKey | null;
  /** Sealed passwords, keyed by server id. */
  secrets: Map<string, EncryptedSecret>;
}

/**
 * Persistence backend of the vault. The app uses IndexedDB; tests inject an
 * in-memory implementation so the persistent path stays testable under jsdom
 * (which has no IndexedDB).
 */
export interface VaultStorage {
  load(): Promise<VaultState>;
  save(state: VaultState): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "opencode-pwa-credential-vault";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const DEK_ROW_ID = "dek";
const SECRET_ROW_PREFIX = "secret:";
const IV_BYTES = 12;
const AES_KEY_LENGTH = 256;

// ---------------------------------------------------------------------------
// Crypto primitives (pure, unit-testable)
// ---------------------------------------------------------------------------

function subtleOrNull(): SubtleCrypto | null {
  const subtle = globalThis.crypto?.subtle;
  return typeof subtle?.encrypt === "function" ? subtle : null;
}

/** True when WebCrypto with AES-GCM is usable (a hard requirement). */
export function cryptoAvailable(): boolean {
  return subtleOrNull() !== null;
}

/** True when IndexedDB is usable (the persistent store). */
export function indexedDbAvailable(): boolean {
  return typeof globalThis.indexedDB !== "undefined";
}

/** True when credentials can be stored across reloads. */
export function vaultAvailable(): boolean {
  return cryptoAvailable() && indexedDbAvailable();
}

/** A fresh, non-extractable AES-GCM 256 key. */
export function generateDek(): Promise<CryptoKey> {
  const subtle = subtleOrNull();
  if (subtle === null) throw new Error("WebCrypto ist in diesem Browser nicht verfügbar.");
  return subtle.generateKey({ name: "AES-GCM", length: AES_KEY_LENGTH }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Seal `plaintext` under `key` with a new random IV. */
export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedSecret> {
  const subtle = subtleOrNull();
  if (subtle === null) throw new Error("WebCrypto ist in diesem Browser nicht verfügbar.");
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/** Open a sealed secret. Throws when the key does not match (tampered data). */
export async function decryptText(key: CryptoKey, secret: EncryptedSecret): Promise<string> {
  const subtle = subtleOrNull();
  if (subtle === null) throw new Error("WebCrypto ist in diesem Browser nicht verfügbar.");
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: secret.iv }, key, secret.ciphertext);
  return new TextDecoder().decode(plain);
}

// ---------------------------------------------------------------------------
// IndexedDB backend
// ---------------------------------------------------------------------------

function secretRowId(serverId: string): string {
  return `${SECRET_ROW_PREFIX}${serverId}`;
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

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error);
    };
    tx.onabort = () => {
      reject(tx.error);
    };
  });
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return null;
}

function readRows(rows: unknown): { key: CryptoKey | null; secrets: Map<string, EncryptedSecret> } {
  const list = Array.isArray(rows) ? rows : [];
  let key: CryptoKey | null = null;
  const secrets = new Map<string, EncryptedSecret>();
  for (const row of list) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = record["id"];
    if (typeof id !== "string") continue;
    if (id === DEK_ROW_ID) {
      const stored: unknown = record["key"];
      if (stored !== null && typeof stored === "object") key = stored as CryptoKey;
      continue;
    }
    if (!id.startsWith(SECRET_ROW_PREFIX)) continue;
    const iv = toBytes(record["iv"]);
    const ciphertext = toBytes(record["ciphertext"]);
    if (iv === null || ciphertext === null) continue;
    secrets.set(id.slice(SECRET_ROW_PREFIX.length), { iv, ciphertext });
  }
  return { key, secrets };
}

/**
 * IndexedDB storage for the vault. One object store holds the DEK row plus one
 * row per sealed secret (`secret:<serverID>`).
 */
export function indexedDbVaultStorage(): VaultStorage {
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  function open(): Promise<IDBDatabase | null> {
    if (dbPromise !== null) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!indexedDbAvailable()) {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
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

  async function requireDb(): Promise<IDBDatabase> {
    const db = await open();
    if (db === null) throw new Error("IndexedDB ist in diesem Browser nicht verfügbar.");
    return db;
  }

  return {
    async load(): Promise<VaultState> {
      const db = await requireDb();
      const tx = db.transaction(STORE_NAME, "readonly");
      const rows = await requestToPromise(tx.objectStore(STORE_NAME).getAll());
      return readRows(rows);
    },

    async save(state: VaultState): Promise<void> {
      const db = await requireDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      // All requests are issued synchronously: awaiting between them would let
      // the transaction auto-commit.
      if (state.key !== null) store.put({ id: DEK_ROW_ID, key: state.key });
      const wanted = new Set<string>();
      for (const [serverId, secret] of state.secrets) {
        const rowId = secretRowId(serverId);
        wanted.add(rowId);
        store.put({ id: rowId, iv: secret.iv, ciphertext: secret.ciphertext });
      }
      const existing = store.getAllKeys();
      existing.onsuccess = () => {
        for (const key of existing.result) {
          const name = String(key);
          if (name === DEK_ROW_ID || wanted.has(name)) continue;
          store.delete(key);
        }
      };
      await transactionDone(tx);
    },

    async clear(): Promise<void> {
      const db = await requireDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      await transactionDone(tx);
    },
  };
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let storageOverride: VaultStorage | null = null;
let activeStorage: VaultStorage | null = null;
let state: VaultState | null = null;
let mode: VaultMode | null = null;
let initPromise: Promise<VaultMode> | null = null;
let pendingMigration: Promise<unknown> = Promise.resolve();

/** Plaintext cache for the session, and the only store in `memory` mode. */
const sessionSecrets = new Map<string, string>();
const revisions = new Map<string, number>();

function bumpRevision(serverId: string): void {
  revisions.set(serverId, (revisions.get(serverId) ?? 0) + 1);
}

/**
 * Bumped whenever the credential of `serverId` changes. Consumers use it to
 * notice a changed password without ever seeing the password itself.
 */
export function credentialRevision(serverId: string): number {
  return revisions.get(serverId) ?? 0;
}

function backend(): VaultStorage | null {
  if (storageOverride !== null) return storageOverride;
  return indexedDbAvailable() ? indexedDbVaultStorage() : null;
}

async function init(): Promise<VaultMode> {
  if (subtleOrNull() === null) {
    mode = "memory";
    return mode;
  }
  const storage = backend();
  if (storage === null) {
    mode = "memory";
    return mode;
  }
  activeStorage = storage;
  try {
    // The DEK is created lazily on the first seal, so an install that has no
    // password at all never touches WebCrypto or IndexedDB.
    state = await storage.load();
    mode = "persistent";
  } catch {
    // A broken IndexedDB must not break the app: degrade to session-only.
    state = null;
    mode = "memory";
  }
  return mode;
}

/** The install-wide DEK, created on first use. */
async function requireDek(): Promise<CryptoKey> {
  if (state === null) throw new Error("Der Tresor ist nicht verfügbar.");
  if (state.key === null) state.key = await generateDek();
  return state.key;
}

/** Initialize the vault (idempotent). Never rejects. */
export function initVault(): Promise<VaultMode> {
  if (initPromise === null) initPromise = init();
  return initPromise;
}

/** The mode the vault settled on; `null` while it is still initializing. */
export function vaultMode(): VaultMode | null {
  return mode;
}

/**
 * Resolves once the vault is usable AND the startup migration has run. API
 * calls must await this before they seal or open a credential, otherwise a
 * first paint could still see a plaintext password that is being migrated.
 */
export function whenVaultReady(): Promise<VaultMode> {
  return initVault().then(async (settled) => {
    await pendingMigration;
    return settled;
  });
}

async function persist(): Promise<void> {
  if (state === null || activeStorage === null) return;
  await activeStorage.save(state);
}

/**
 * Seal and store the password of one server. Never throws: a failing vault
 * degrades to session-only storage, and the German notice in Settings appears.
 *
 * Writers await the vault itself, not the startup migration — the migration is
 * itself a writer, so waiting for it here would deadlock.
 */
export async function storeCredential(serverId: string, password: string): Promise<VaultMode> {
  await initVault();
  bumpRevision(serverId);
  if (mode === "persistent" && state !== null) {
    try {
      const secret = await encryptText(await requireDek(), password);
      state.secrets.set(serverId, secret);
      await persist();
      sessionSecrets.set(serverId, password);
      return "persistent";
    } catch {
      // Keep going with the session-only copy so the server stays reachable.
      state.secrets.delete(serverId);
      mode = "memory";
    }
  }
  sessionSecrets.set(serverId, password);
  return mode ?? "memory";
}

/**
 * Open the password of one server. `""` when nothing is stored — either the
 * server has no password, or it was never migrated into this session.
 *
 * Reads wait for the startup migration, so the first paint after an app update
 * never sends a request without the password that was in `localStorage`.
 */
export async function readCredential(serverId: string): Promise<string> {
  await whenVaultReady();
  const cached = sessionSecrets.get(serverId);
  if (cached !== undefined) return cached;
  if (mode !== "persistent" || state === null || state.key === null) return "";
  const secret = state.secrets.get(serverId);
  if (secret === undefined) return "";
  try {
    const text = await decryptText(state.key, secret);
    sessionSecrets.set(serverId, text);
    return text;
  } catch {
    // Unreadable (wrong key / tampered): behave like "no password".
    return "";
  }
}

/** Drop the credential of one server (server removed). */
export async function removeCredential(serverId: string): Promise<void> {
  await initVault();
  sessionSecrets.delete(serverId);
  bumpRevision(serverId);
  if (state === null || !state.secrets.delete(serverId)) return;
  try {
    await persist();
  } catch {
    // Session copy is gone, so nothing leaks; the stale row dies with the vault.
  }
}

// ---------------------------------------------------------------------------
// Startup migration
// ---------------------------------------------------------------------------

export interface PlaintextEntry {
  id: string;
  password: string;
}

export interface MigrationResult {
  migrated: string[];
  failed: string[];
}

/**
 * Move plaintext passwords found at startup into the vault. Used with a fake
 * `store` in tests; the app goes through `adoptPlaintextCredentials`.
 */
export async function migratePlaintextCredentials(
  entries: PlaintextEntry[],
  store: (serverId: string, password: string) => Promise<unknown> = storeCredential,
): Promise<MigrationResult> {
  const migrated: string[] = [];
  const failed: string[] = [];
  for (const entry of entries) {
    if (entry.id === "" || entry.password === "") continue;
    try {
      await store(entry.id, entry.password);
      migrated.push(entry.id);
    } catch {
      failed.push(entry.id);
    }
  }
  return { migrated, failed };
}

/** Ids already adopted in this session (guards a double adoption of the same list). */
const adoptedIds = new Set<string>();

/**
 * Register the plaintext credentials that a previous app version left in
 * `localStorage`. Must be called synchronously while the server list is read
 * (i.e. before the first request), so that {@link whenVaultReady} waits for
 * the migration instead of racing it.
 */
export function adoptPlaintextCredentials(entries: PlaintextEntry[]): void {
  const fresh = entries.filter(
    (entry) => entry.id !== "" && entry.password !== "" && !adoptedIds.has(entry.id),
  );
  if (fresh.length === 0) return;
  for (const entry of fresh) adoptedIds.add(entry.id);
  pendingMigration = migratePlaintextCredentials(fresh);
}

/** Result of the startup migration, once it has run. */
export function plaintextMigrationResult(): Promise<MigrationResult> {
  return pendingMigration.then((value) => {
    const result: MigrationResult | undefined = value as MigrationResult | undefined;
    return result ?? { migrated: [], failed: [] };
  });
}

/**
 * Test seam: use `backend` instead of IndexedDB. Pass `null` to restore
 * autodetection and drop all module state.
 */
export function setVaultStorageForTests(backendOverride: VaultStorage | null): void {
  storageOverride = backendOverride;
  activeStorage = null;
  state = null;
  mode = null;
  initPromise = null;
  pendingMigration = Promise.resolve();
  adoptedIds.clear();
  sessionSecrets.clear();
  revisions.clear();
}