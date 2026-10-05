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
  if (!open) return null;
  return (
    <div
      className="modal modal-open"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
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
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-error"
            onClick={onConfirm}
            disabled={busy}
            aria-label={confirmLabel}
          >
            {busy ? "Bitte warten …" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
