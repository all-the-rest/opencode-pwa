import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sessionTitle } from "../lib/opencode.ts";

const STORAGE_KEY = "opencode-pwa:session-tabs";

/** One open session tab: a session bound to the server it lives on. */
export interface SessionTab {
  serverID: string;
  sessionID: string;
  /** Last known title (session list label); falls back to the session id. */
  title: string;
}

function tabKey(tab: Pick<SessionTab, "serverID" | "sessionID">): string {
  return `${tab.serverID}::${tab.sessionID}`;
}

function toSessionTab(entry: unknown): SessionTab | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  if (typeof record["serverID"] !== "string" || record["serverID"] === "") return null;
  if (typeof record["sessionID"] !== "string" || record["sessionID"] === "") return null;
  const sessionID: string = record["sessionID"];
  const rawTitle = typeof record["title"] === "string" ? record["title"] : null;
  return { serverID: record["serverID"], sessionID, title: sessionTitle(rawTitle, sessionID) };
}

function loadInitial(): SessionTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tabs: SessionTab[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const tab = toSessionTab(entry);
      if (tab === null) continue;
      const key = tabKey(tab);
      if (seen.has(key)) continue;
      seen.add(key);
      tabs.push(tab);
    }
    return tabs;
  } catch {
    return [];
  }
}

interface SessionTabsValue {
  tabs: SessionTab[];
  /** Register (or refresh the title of) an open session tab. */
  openTab: (tab: SessionTab) => void;
  /**
   * Register a tab only when it is missing (never touches the title of an
   * existing tab). For mount effects that must not re-add a just-closed tab
   * when the tab list changes (no `tabs` dependency needed).
   */
  ensureTab: (tab: SessionTab) => void;
  /** Update the cached title of an open tab (e.g. when session info loads). */
  retitleTab: (serverID: string, sessionID: string, title: string) => void;
  /** Remove one tab. Navigation is the caller's job (see `SessionTabBar`). */
  closeTab: (serverID: string, sessionID: string) => void;
  /** Remove all tabs (tab-bar "close all"). Navigation is the caller's job. */
  closeAllTabs: () => void;
  /** Drop tabs whose server no longer exists (called with the known ids). */
  pruneTabs: (serverIDs: readonly string[]) => void;
}

const SessionTabsContext = createContext<SessionTabsValue | null>(null);

export function SessionTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<SessionTab[]>(() => loadInitial());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // storage full or unavailable: keep in-memory state
    }
  }, [tabs]);

  const openTab = useCallback((tab: SessionTab) => {
    setTabs((prev) => {
      const key = tabKey(tab);
      const existing = prev.find((t) => tabKey(t) === key);
      if (existing !== undefined) {
        if (existing.title === tab.title) return prev;
        return prev.map((t) => (tabKey(t) === key ? { ...t, title: tab.title } : t));
      }
      return [...prev, tab];
    });
  }, []);

  const ensureTab = useCallback((tab: SessionTab) => {
    // Pure functional update: StrictMode may invoke the updater twice, and
    // returning `prev` when present keeps that a no-op without extra renders.
    setTabs((prev) => (prev.some((t) => tabKey(t) === tabKey(tab)) ? prev : [...prev, tab]));
  }, []);

  const retitleTab = useCallback((serverID: string, sessionID: string, title: string) => {
    if (title === "") return;
    setTabs((prev) =>
      prev.map((t) =>
        t.serverID === serverID && t.sessionID === sessionID && t.title !== title
          ? { ...t, title }
          : t,
      ),
    );
  }, []);

  const closeTab = useCallback((serverID: string, sessionID: string): void => {
    setTabs((prev) => prev.filter((t) => !(t.serverID === serverID && t.sessionID === sessionID)));
  }, []);

  const closeAllTabs = useCallback((): void => {
    setTabs([]);
  }, []);

  const pruneTabs = useCallback((serverIDs: readonly string[]) => {
    const known = new Set(serverIDs);
    setTabs((prev) => prev.filter((t) => known.has(t.serverID)));
  }, []);

  const value = useMemo<SessionTabsValue>(
    () => ({ tabs, openTab, ensureTab, retitleTab, closeTab, closeAllTabs, pruneTabs }),
    [tabs, openTab, ensureTab, retitleTab, closeTab, closeAllTabs, pruneTabs],
  );

  return <SessionTabsContext.Provider value={value}>{children}</SessionTabsContext.Provider>;
}

export function useSessionTabs(): SessionTabsValue {
  const ctx = useContext(SessionTabsContext);
  if (ctx === null) {
    throw new Error("useSessionTabs must be used inside <SessionTabsProvider>");
  }
  return ctx;
}

export { STORAGE_KEY as SESSION_TABS_STORAGE_KEY, tabKey as sessionTabKey };
