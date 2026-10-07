import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "opencode-pwa:layout-mode";

/**
 * Page layout density. `single` stacks every section in one column (mobile
 * behaviour, also on desktop); `split` arranges the page sections into 2–3
 * side-by-side panels on wide screens (`lg+`) so several agents/panels stay
 * visible at once. Below `lg` both modes render single-column — split never
 * affects the mobile layout.
 */
export type LayoutMode = "single" | "split";

function parseMode(value: unknown): LayoutMode {
  return value === "split" ? "split" : "single";
}

function loadInitial(): LayoutMode {
  try {
    return parseMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "single";
  }
}

interface LayoutModeValue {
  mode: LayoutMode;
  /** True while the split-panel layout is active (wide screens only). */
  split: boolean;
  toggleMode: () => void;
}

const LayoutModeContext = createContext<LayoutModeValue | null>(null);

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<LayoutMode>(() => loadInitial());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage full or unavailable: keep in-memory state
    }
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "split" ? "single" : "split"));
  }, []);

  const value = useMemo<LayoutModeValue>(
    () => ({ mode, split: mode === "split", toggleMode }),
    [mode, toggleMode],
  );

  return <LayoutModeContext.Provider value={value}>{children}</LayoutModeContext.Provider>;
}

export function useLayoutMode(): LayoutModeValue {
  const ctx = useContext(LayoutModeContext);
  if (ctx === null) {
    throw new Error("useLayoutMode must be used inside <LayoutModeProvider>");
  }
  return ctx;
}

export { STORAGE_KEY as LAYOUT_MODE_STORAGE_KEY };
