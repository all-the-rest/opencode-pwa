import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "opencode-pwa:session-mode";

/**
 * Session chat mode (owner requirement, wave 6):
 *   - `basic` ("Einfach") is the default: chat + composer + the running strip.
 *     The agent/model picks, the attachment extras and the "Mehr…" disclosure
 *     stay hidden — nothing is removed, one tap on "Experte" reveals them.
 *   - `expert` ("Experte") shows everything the session page has.
 *
 * Persisted in localStorage so the choice survives reloads; an unreadable
 * storage value falls back to `basic` (start simple, never broken).
 */
export type SessionMode = "basic" | "expert";

function parseMode(value: unknown): SessionMode {
  return value === "expert" ? "expert" : "basic";
}

function loadInitial(): SessionMode {
  try {
    return parseMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "basic";
  }
}

interface SessionModeValue {
  mode: SessionMode;
  /** True while the expert surface is revealed. */
  expert: boolean;
  setMode: (mode: SessionMode) => void;
  toggleMode: () => void;
}

const SessionModeContext = createContext<SessionModeValue | null>(null);

export function SessionModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SessionMode>(() => loadInitial());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage full or unavailable: keep in-memory state
    }
  }, [mode]);

  const setMode = useCallback((next: SessionMode) => {
    setModeState(parseMode(next));
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === "expert" ? "basic" : "expert"));
  }, []);

  const value = useMemo<SessionModeValue>(
    () => ({ mode, expert: mode === "expert", setMode, toggleMode }),
    [mode, setMode, toggleMode],
  );

  return <SessionModeContext.Provider value={value}>{children}</SessionModeContext.Provider>;
}

export function useSessionMode(): SessionModeValue {
  const ctx = useContext(SessionModeContext);
  if (ctx === null) {
    throw new Error("useSessionMode must be used inside <SessionModeProvider>");
  }
  return ctx;
}

export { STORAGE_KEY as SESSION_MODE_STORAGE_KEY };
