import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon.tsx";
import {
  createSession,
  listDirectory,
  type FileEntryRow,
  type ServerConfig,
  type SessionInfo,
} from "../lib/opencode.ts";

export interface ServerFolderPickerProps {
  server: ServerConfig;
  open: boolean;
  onClose: () => void;
  /** A session was created in the chosen directory (open it). */
  onCreated: (session: SessionInfo) => void;
}

/** Join a directory and an entry name without doubling the separator. */
function joinPath(directory: string, name: string): string {
  if (directory === "") return name;
  return directory.endsWith("/") ? `${directory}${name}` : `${directory}/${name}`;
}

/** Parent directory of an absolute path ("" at the root). */
function parentPath(directory: string): string {
  const index = directory.lastIndexOf("/");
  if (index <= 0) return "";
  return directory.slice(0, index);
}

/**
 * Server-side folder picker for "Neues Projekt" — the parity answer to the
 * original GUI's folder dialog.
 *
 * There is no project-create endpoint in the client (`project: { list, update }`
 * only, verified client.d.ts:147-149), so a project is created the way the
 * server itself creates one: a session whose `location.directory` points at the
 * chosen folder (`SessionCreateInput.location`, verified types.d.ts:3767+).
 * The dialog browses the server's directories with `file.list` (our
 * `listDirectory`), shows a breadcrumb of the current path, lets you descend
 * and ascend, and starts the session on confirm.
 *
 * Mobile: full-width rows, no horizontal scrolling at 360px; desktop gets the
 * same dialog with a wider box.
 */
export default function ServerFolderPicker({
  server,
  open,
  onClose,
  onCreated,
}: ServerFolderPickerProps) {
  /** Absolute directory currently shown ("" = the server's own location). */
  const [directory, setDirectory] = useState("");
  const [entries, setEntries] = useState<FileEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(
    (path: string) => {
      setLoading(true);
      setError(null);
      listDirectory(server, path === "" ? undefined : path).then((result) => {
        setLoading(false);
        if (result.error !== null || result.data === null) {
          setError(result.error ?? t`Ordner konnten nicht geladen werden.`);
          setEntries([]);
          return;
        }
        setDirectory(result.data.location ?? path);
        setEntries(result.data.entries);
      });
    },
    [server],
  );

  // Load the server location once, whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setCreating(false);
    setCreateError(null);
    load("");
  }, [open, load]);

  // Escape closes the dialog (unless a session is being created).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !creating) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, creating, onClose]);

  if (!open) return null;

  const directories = entries
    .filter((entry) => entry.type === "directory")
    .sort((a, b) => a.path.localeCompare(b.path));
  const files = entries
    .filter((entry) => entry.type !== "directory")
    .sort((a, b) => a.path.localeCompare(b.path));
  const segments = directory === "" ? [] : directory.replace(/\\/g, "/").split("/").filter((s) => s !== "");
  const rootLabel = t`Server-Root`;
  // Breadcrumb targets keep the absolute marker: "/srv/app" -> ["/srv", "/srv/app"].
  const crumbs = segments.map((segment, index) => ({
    label: segment,
    target: `${directory.startsWith("/") ? "/" : ""}${segments.slice(0, index + 1).join("/")}`,
  }));

  async function confirm() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const result = await createSession(server, { directory });
    setCreating(false);
    if (result.error !== null || result.data === null) {
      setCreateError(result.error ?? t`Session konnte nicht erstellt werden.`);
      return;
    }
    onCreated(result.data);
  }

  return (
    <div
      className="modal modal-open"
      role="dialog"
      aria-modal="true"
      aria-label={t`Ordner auf dem Server wählen`}
      data-testid="folder-picker"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) onClose();
      }}
    >
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Icon name="project" />
          <Trans>Neues Projekt – Ordner wählen</Trans>
        </h3>
        <p className="text-sm opacity-70 mt-1">
          <Trans>
            Auf dem Server stöbern und bestätigen: Die Session entsteht im gewählten Ordner,
            das Projekt richtet der Server selbst ein.
          </Trans>
        </p>

        <div className="flex items-center gap-1 mt-3 flex-wrap" data-testid="folder-picker-breadcrumb">
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            disabled={loading || creating}
            aria-label={rootLabel}
            data-testid="folder-picker-crumb-root"
            onClick={() => load("")}
          >
            {rootLabel}
          </button>
          {crumbs.map((crumb, index) => {
            // Lingui-safe hoist: no member access inside the message.
            const target = crumb.target;
            return (
            <span key={crumb.target} className="flex items-center gap-1">
              <span className="opacity-50" aria-hidden="true">/</span>
              <button
                type="button"
                className="btn btn-xs btn-ghost min-w-0"
                disabled={loading || creating}
                aria-label={t`Zu ${target}`}
                data-testid={`folder-picker-crumb-${index}`}
                onClick={() => load(crumb.target)}
              >
                <span className="truncate max-w-32">{crumb.label}</span>
              </button>
            </span>
            );
          })}
        </div>

        <p
          className="font-mono text-xs bg-base-300 rounded p-2 mt-2 break-all"
          data-testid="folder-picker-path"
        >
          {directory === "" ? t`Lädt …` : directory}
        </p>

        {loading && (
          <p className="text-sm opacity-70 mt-2" data-testid="folder-picker-loading">
            <Trans>Ordner werden geladen …</Trans>
          </p>
        )}
        {!loading && error !== null && (
          <div className="alert alert-error mt-2" data-testid="folder-picker-error">
            <span>{error}</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={creating}
              onClick={() => load(directory)}
            >
              <Trans>Erneut laden</Trans>
            </button>
          </div>
        )}
        {!loading && error === null && directories.length === 0 && files.length === 0 && (
          <p className="text-sm opacity-70 mt-2" data-testid="folder-picker-empty">
            <Trans>Dieser Ordner ist leer.</Trans>
          </p>
        )}

        {!loading && error === null && (directories.length > 0 || files.length > 0) && (
          <ul className="menu gap-0.5 mt-2 max-h-72 overflow-auto" data-testid="folder-picker-list">
            {directory !== "" && (
              <li>
                <button
                  type="button"
                  className="flex items-center gap-2"
                  disabled={creating}
                  aria-label={t`Eine Ebene höher`}
                  data-testid="folder-picker-up"
                  onClick={() => load(parentPath(directory))}
                >
                  <span aria-hidden="true">↩</span>
                  <span className="opacity-70">
                    <Trans>Eine Ebene höher</Trans>
                  </span>
                </button>
              </li>
            )}
            {directories.map((entry) => {
              const entryName = entry.path;
              return (
              <li key={entry.path}>
                <button
                  type="button"
                  className="flex items-center gap-2 min-w-0"
                  disabled={creating}
                  aria-label={t`Ordner ${entryName} öffnen`}
                  data-testid={`folder-picker-entry-${entry.path}`}
                  onClick={() => load(joinPath(directory, entry.path))}
                >
                  <Icon name="project" />
                  <span className="truncate">{entry.path}</span>
                </button>
              </li>
              );
            })}
            {files.map((entry) => {
              const fileName = entry.path;
              return (
              <li key={entry.path} className="opacity-50">
                <span className="flex items-center gap-2 min-w-0" title={t`Datei – keine Projektwurzel`}>
                  <Icon name="file" />
                  <span className="truncate" data-testid={`folder-picker-file-${entry.path}`}>
                    {fileName}
                  </span>
                </span>
              </li>
              );
            })}
          </ul>
        )}

        {createError !== null && (
          <div className="alert alert-error mt-2" data-testid="folder-picker-create-error">
            <span>{createError}</span>
          </div>
        )}

        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={creating}
            onClick={onClose}
            data-testid="folder-picker-cancel"
          >
            <Trans>Abbrechen</Trans>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={creating || loading || directory === ""}
            onClick={() => void confirm()}
            data-testid="folder-picker-confirm"
          >
            {creating ? (
              <Trans>Wird erstellt …</Trans>
            ) : (
              <Trans>Projekt hier anlegen</Trans>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
