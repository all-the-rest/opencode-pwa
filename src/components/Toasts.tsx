import { useToast } from "../state/toast.tsx";

/**
 * Fixed toast stack (bottom center, above the sticky composer): transient
 * success/error/info notices, tappable to dismiss early.
 */
export default function Toasts() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div
      className="toast toast-center z-50"
      role="status"
      aria-live="polite"
      data-testid="toast-stack"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          data-testid={`toast-${toast.id}`}
          data-kind={toast.kind}
          className={
            toast.kind === "error"
              ? "alert alert-error shadow-lg"
              : toast.kind === "success"
                ? "alert alert-success shadow-lg"
                : "alert alert-info shadow-lg"
          }
          onClick={() => dismiss(toast.id)}
        >
          <span>{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
