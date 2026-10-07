import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  adoptPlaintextCredentials,
  removeCredential,
  storeCredential,
  vaultMode,
  whenVaultReady,
  type PlaintextEntry,
  type VaultMode,
} from "../lib/credentialVault.ts";
import type { ServerConfig } from "../lib/opencode.ts";
import { defaultServerColor, parseServerColor } from "../lib/serverColor.ts";

const STORAGE_KEY = "opencode-pwa:servers";
const SERVER_EVENT_PREFS_KEY = "opencode-pwa:server-event-notifications";

/** What the Settings form submits; the password goes straight into the vault. */
export interface ServerInput {
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  /**
   * Palette color for the server. Optional on input so callers that only
   * rename (ServerDetail) keep the stored color by omitting it.
   */
  color?: string;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `server-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface InitialLoad {
  servers: ServerConfig[];
  selectedId: string | null;
}

function toServerConfig(entry: unknown): ServerConfig | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  if (typeof record["id"] !== "string") return null;
  if (typeof record["name"] !== "string") return null;
  if (typeof record["baseUrl"] !== "string") return null;
  // Tolerant color: old entries have none, invalid values are dropped (the
  // hash default in `serverColor()` takes over instead of failing the parse).
  const color = parseServerColor(record["color"]);
  return {
    id: record["id"],
    name: record["name"],
    baseUrl: record["baseUrl"],
    username: typeof record["username"] === "string" ? record["username"] : "",
    ...(color !== undefined ? { color } : {}),
  };
}

/**
 * Read the persisted server list and hand any leftover plaintext password to
 * the vault before the first API call can run. The returned records are
 * already password-free, so persisting them wipes the plaintext — and the
 * plaintext never leaves this function frame.
 */
function loadInitial(): InitialLoad {
  const legacy: PlaintextEntry[] = [];
  let parsed: unknown = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw !== "") parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  const servers: ServerConfig[] = [];
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const server = toServerConfig(entry);
      if (server === null) continue;
      if (entry !== null && typeof entry === "object") {
        const password: unknown = (entry as Record<string, unknown>)["password"];
        if (typeof password === "string" && password !== "") {
          legacy.push({ id: server.id, password });
        }
      }
      servers.push(server);
    }
  }
  // Registered synchronously during the first render, so every later
  // `whenVaultReady()` awaits this migration instead of racing it.
  adoptPlaintextCredentials(legacy);
  return { servers, selectedId: defaultSelectedId(servers, null) };
}

function loadServerEventPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SERVER_EVENT_PREFS_KEY);
    if (raw === null || raw === "") return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const prefs: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") prefs[key] = value;
    }
    return prefs;
  } catch {
    return {};
  }
}

interface ServerContextValue {
  servers: ServerConfig[];
  selectedServerId: string | null;
  selectedServer: ServerConfig | null;
  selectServer: (id: string | null) => void;
  addServer: (input: ServerInput) => Promise<ServerConfig>;
  updateServer: (id: string, input: ServerInput) => Promise<void>;
  removeServer: (id: string) => void;
  /** Per-server event-notification opt-out, persisted in localStorage. Default: on. */
  serverEventPrefs: Record<string, boolean>;
  toggleServerEventNotifications: (id: string) => void;
  /**
   * Where server passwords live: `"persistent"` = sealed with AES-GCM in
   * IndexedDB, `"memory"` = session-only fallback (never persisted).
   * `null` while the vault is still initializing.
   */
  credentialStorage: VaultMode | null;
}

const ServerContext = createContext<ServerContextValue | null>(null);

function defaultSelectedId(servers: ServerConfig[], current: string | null): string | null {
  if (current !== null && servers.some((s) => s.id === current)) return current;
  const envDefault = import.meta.env["VITE_DEFAULT_SERVER_URL"];
  if (typeof envDefault === "string" && envDefault !== "") {
    const match = servers.find((s) => s.baseUrl === envDefault);
    if (match) return match.id;
  }
  return servers.length > 0 ? servers[0]?.id ?? null : null;
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const [initial] = useState<InitialLoad>(() => loadInitial());
  const [servers, setServers] = useState<ServerConfig[]>(initial.servers);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(initial.selectedId);
  const [serverEventPrefs, setServerEventPrefs] = useState<Record<string, boolean>>(() =>
    loadServerEventPrefs(),
  );
  const [credentialStorage, setCredentialStorage] = useState<VaultMode | null>(() => vaultMode());

  // The password-free server list replaces the legacy entry, which is what
  // wipes the plaintext from localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    } catch {
      // storage full or unavailable: keep in-memory state
    }
  }, [servers]);

  useEffect(() => {
    let cancelled = false;
    void whenVaultReady().then((settled) => {
      if (!cancelled) setCredentialStorage(settled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SERVER_EVENT_PREFS_KEY, JSON.stringify(serverEventPrefs));
    } catch {
      // storage full or unavailable: keep in-memory state
    }
  }, [serverEventPrefs]);

  const selectServer = useCallback((id: string | null) => {
    setSelectedServerId(id);
  }, []);

  const addServer = useCallback(async (input: ServerInput): Promise<ServerConfig> => {
    const id = createId();
    const color = parseServerColor(input.color) ?? defaultServerColor(id);
    const server: ServerConfig = {
      id,
      name: input.name,
      baseUrl: input.baseUrl,
      username: input.username,
      // A fresh server always carries an explicit palette color (picked or
      // derived from the new id), so the dot never depends on the fallback.
      color,
    };
    setServers((prev) => {
      const next = [...prev, server];
      setSelectedServerId((current) => current ?? server.id);
      return next;
    });
    const mode = await storeCredential(server.id, input.password);
    setCredentialStorage(mode);
    return server;
  }, []);

  const updateServer = useCallback(async (id: string, input: ServerInput): Promise<void> => {
    const nextColor = parseServerColor(input.color);
    setServers((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              id,
              name: input.name,
              baseUrl: input.baseUrl,
              username: input.username,
              // Omitted color keeps the stored one (rename flow); an explicit
              // palette color replaces it; invalid values are ignored.
              color: nextColor ?? s.color ?? defaultServerColor(id),
            }
          : s,
      ),
    );
    // A blank password keeps the stored credential: the secret never enters
    // the DOM, so "no new password" must not wipe the vault entry. The only
    // way to drop a stored credential is removing the server (removeServer).
    if (input.password !== "") {
      const mode = await storeCredential(id, input.password);
      setCredentialStorage(mode);
    }
  }, []);

  const removeServer = useCallback((id: string) => {
    setServers((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setSelectedServerId((current) => {
        if (current !== id) return current;
        return defaultSelectedId(next, null);
      });
      return next;
    });
    void removeCredential(id);
  }, []);

  const toggleServerEventNotifications = useCallback((id: string) => {
    setServerEventPrefs((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const value = useMemo<ServerContextValue>(() => {
    const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null;
    return {
      servers,
      selectedServerId,
      selectedServer,
      selectServer,
      addServer,
      updateServer,
      removeServer,
      serverEventPrefs,
      toggleServerEventNotifications,
      credentialStorage,
    };
  }, [
    servers,
    selectedServerId,
    selectServer,
    addServer,
    updateServer,
    removeServer,
    serverEventPrefs,
    toggleServerEventNotifications,
    credentialStorage,
  ]);

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServers(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (ctx === null) {
    throw new Error("useServers must be used inside <ServerProvider>");
  }
  return ctx;
}

export { SERVER_EVENT_PREFS_KEY, STORAGE_KEY };