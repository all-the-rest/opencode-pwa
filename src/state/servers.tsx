import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ServerConfig } from "../lib/opencode.ts";

const STORAGE_KEY = "opencode-pwa:servers";
const SERVER_EVENT_PREFS_KEY = "opencode-pwa:server-event-notifications";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `server-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function loadServers(): ServerConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ServerConfig =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ServerConfig).id === "string" &&
        typeof (entry as ServerConfig).name === "string" &&
        typeof (entry as ServerConfig).baseUrl === "string",
    );
  } catch {
    return [];
  }
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
  addServer: (input: Omit<ServerConfig, "id">) => ServerConfig;
  updateServer: (id: string, input: Omit<ServerConfig, "id">) => void;
  removeServer: (id: string) => void;
  /** Per-server event-notification opt-out, persisted in localStorage. Default: on. */
  serverEventPrefs: Record<string, boolean>;
  toggleServerEventNotifications: (id: string) => void;
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
  const [servers, setServers] = useState<ServerConfig[]>(() => loadServers());
  const [selectedServerId, setSelectedServerId] = useState<string | null>(() =>
    defaultSelectedId(loadServers(), null),
  );
  const [serverEventPrefs, setServerEventPrefs] = useState<Record<string, boolean>>(() =>
    loadServerEventPrefs(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    } catch {
      // storage full or unavailable: keep in-memory state
    }
  }, [servers]);

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

  const addServer = useCallback((input: Omit<ServerConfig, "id">) => {
    const server: ServerConfig = { ...input, id: createId() };
    setServers((prev) => {
      const next = [...prev, server];
      setSelectedServerId((current) => current ?? server.id);
      return next;
    });
    return server;
  }, []);

  const updateServer = useCallback((id: string, input: Omit<ServerConfig, "id">) => {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...input, id } : s)));
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
