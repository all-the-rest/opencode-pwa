import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "error" | "success" | "info";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastValue {
  toasts: ToastItem[];
  /** Show a transient notice (auto-dismissed after a few seconds). */
  notify: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const TOAST_TTL_MS = 4000;

/**
 * Minimal app-wide toast system (adoption item 5): transient success/error
 * notices (rename failures, …) without blocking dialogs. Errors stay a beat
 * longer by keying the timeout off the kind.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextID = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextID.current;
      nextID.current += 1;
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? TOAST_TTL_MS * 2 : TOAST_TTL_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastValue>(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
