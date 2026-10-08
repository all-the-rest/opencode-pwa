import { useEffect } from "react";
import { Trans } from "@lingui/react/macro";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** German confirm dialog for destructive actions (kill session/shell). */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escape closes the dialog (unless an action is running); the callers
  // additionally guard `busy` in their `onCancel` handlers.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      className="modal modal-open"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      data-testid="confirm-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal-box">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4 text-sm">{message}</p>
        {error !== null && (
          <div className="alert alert-error mb-2">
            <span>{error}</span>
          </div>
        )}
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            <Trans>Abbrechen</Trans>
          </button>
          <button
            type="button"
            className="btn btn-error"
            onClick={onConfirm}
            disabled={busy}
            aria-label={confirmLabel}
          >
            {busy ? <Trans>Bitte warten …</Trans> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
