import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.tsx";
import { COMPOSER_MAX_HEIGHT, clampComposerHeight } from "../lib/composer.ts";
import {
  ATTACH_ACCEPT,
  attachmentName,
  attachmentPreviewUrl,
  attachmentSubtitle,
  type PromptAttachment,
} from "../lib/promptAttachments.ts";
import {
  modelOptionValue,
  type AgentOption,
  type ModelOption,
} from "../lib/opencode.ts";

/**
 * Prompt composer (parity with the original's `PromptInputV2`):
 *   - an autogrowing textarea (Enter sends, Shift+Enter inserts a newline,
 *     growing to `COMPOSER_MAX_HEIGHT` before it scrolls);
 *   - agent/model/variant picks as compact chips — the same `<select>`
 *     controls that used to sit above the chat, moved into the composer;
 *   - attachments: drag & drop and a file picker with the original's accept
 *     list, rendered as removable 160px two-line cards (image preview where
 *     the data allows), plus the workspace-path chips (`file://…`);
 *   - a Stop button while a run is active, otherwise Send.
 *
 * Wave 6 adds two guards: `expert` (the "Einfach/Experte" mode — simple hides
 * the picker bar; drag & drop still attaches files and the mode toggle brings
 * everything back, so nothing becomes unreachable) and `offline` (sending is
 * blocked while the server does not answer). `pickerLoading` switches the
 * selects to a "Lädt…" state instead of the "Keiner"/"Keines" placeholders.
 *
 * All state (draft, attachments, pickers) stays with the caller: this
 * component is the view layer and keeps its DOM test ids stable.
 */
export interface PromptComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  attachments: PromptAttachment[];
  onRemoveAttachment: (id: string) => void;
  /** Attach a workspace path (`file://…` chip). */
  onAttachPath: (path: string) => void;
  /** Attach picked/dropped files (async: base64 is read per file). */
  onAttachFiles: (files: File[]) => void;
  onSubmit: () => void;
  onStop: () => void;
  /** A prompt is in flight. */
  busy: boolean;
  /** A turn runs: the primary button becomes Stop. */
  runActive: boolean;
  agents: AgentOption[];
  models: ModelOption[];
  currentAgent: string | null;
  currentModelValue: string;
  onAgentChange: (value: string) => void;
  onModelChange: (value: string) => void;
  switching: boolean;
  /** "Experte" mode: reveals the picker bar (agent/model, attachments). */
  expert: boolean;
  /** True while the agent/model picker data is loading ("Lädt…"). */
  pickerLoading: boolean;
  /** The server does not answer: sending is blocked. */
  offline: boolean;
  /** Called when a send is attempted while offline (shows the toast). */
  onOfflineSendAttempt: () => void;
}

export default function PromptComposer({
  draft,
  onDraftChange,
  attachments,
  onRemoveAttachment,
  onAttachPath,
  onAttachFiles,
  onSubmit,
  onStop,
  busy,
  runActive,
  agents,
  models,
  currentAgent,
  currentModelValue,
  onAgentChange,
  onModelChange,
  switching,
  expert,
  pickerLoading,
  offline,
  onOfflineSendAttempt,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pathDraft, setPathDraft] = useState("");
  const [dragging, setDragging] = useState(false);

  // Autogrow: reset to the content height, then clamp to the max — the
  // textarea scrolls instead of growing past it.
  useEffect(() => {
    const node = textareaRef.current;
    if (node === null) return;
    node.style.height = "auto";
    const next = clampComposerHeight(node.scrollHeight);
    node.style.height = `${next}px`;
    node.style.overflowY = next >= COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, [draft]);

  const canSend = !busy && !offline && draft.trim() !== "";
  // The primary action mirrors the button: Send while idle, never while the
  // Stop button is showing (Stop is a separate control, as in the original).
  const submit = (): void => {
    if (runActive || !canSend) {
      // Offline: explain once why nothing happened instead of failing silently.
      if (offline && !runActive && !busy && draft.trim() !== "") onOfflineSendAttempt();
      return;
    }
    onSubmit();
  };

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline; IME composition must not
    // count as Enter (the reference guards on `isComposing` too).
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!canSend) {
      if (offline && !runActive && !busy && draft.trim() !== "") onOfflineSendAttempt();
      return;
    }
    event.preventDefault();
    submit();
  }

  function handlePathSubmit(event: React.FormEvent) {
    event.preventDefault();
    const path = pathDraft.trim().replace(/^\/+/, "");
    if (path === "") return;
    onAttachPath(path);
    setPathDraft("");
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) onAttachFiles(files);
  }

  return (
    <div
      className={`sticky bottom-4 z-10 relative rounded-2xl border bg-base-100 p-2 shadow-sm oc-dense ${
        dragging ? "border-primary border-dashed" : "border-base-300"
      }`}
      data-testid="session-composer"
      onDragEnter={() => setDragging(true)}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACH_ACCEPT}
        className="hidden"
        aria-label={t`Dateien für den Prompt auswählen`}
        data-testid="prompt-attachment-file-input"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) onAttachFiles(files);
          event.currentTarget.value = "";
        }}
      />
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl bg-base-100/90"
          data-testid="prompt-drop-overlay"
        >
          <span>
            <Trans>Datei hier ablegen</Trans>
          </span>
        </div>
      )}
      {attachments.length > 0 && (
        <ul
          className="flex flex-nowrap gap-2 overflow-x-auto pb-2"
          data-testid="prompt-attachments"
          aria-label={t`Angehängte Dateien`}
        >
          {attachments.map((item) => {
            const name = attachmentName(item);
            const preview = attachmentPreviewUrl(item);
            const subtitle = attachmentSubtitle(item);
            const testid =
              item.kind === "path" ? `prompt-attachment-${item.path}` : `prompt-attachment-${item.id}`;
            return (
              <li
                key={item.id}
                className="relative shrink-0"
                data-testid={testid}
                data-attachment-kind={item.kind}
              >
                {/* 160px two-line card (parity with `AttachmentCardV2`). */}
                <div
                  className="oc-attachment-card flex flex-col gap-1 rounded-md border border-base-300 bg-base-200 p-2"
                  title={item.kind === "path" ? item.path : name}
                >
                  {preview !== null ? (
                    <img
                      src={preview}
                      alt={name}
                      className="h-14 w-full rounded object-cover"
                      data-testid={`${testid}-preview`}
                    />
                  ) : (
                    <span className="flex items-center gap-1 opacity-70">
                      <Icon name="file" />
                      <span className="oc-micro">{subtitle}</span>
                    </span>
                  )}
                  <span className="oc-dense-strong truncate" title={name}>
                    {name}
                  </span>
                  {preview !== null && (
                    <span className="oc-micro truncate opacity-70">
                      {subtitle}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-circle btn-neutral absolute -top-2 -end-2 shadow"
                  aria-label={t`Anhang ${name} entfernen`}
                  data-testid={`${testid}-remove`}
                  onClick={() => onRemoveAttachment(item.id)}
                >
                  <Icon name="close" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          className="oc-composer-input input input-ghost flex-1 min-h-11 focus:bg-transparent"
          placeholder={t`Beliebige Frage stellen, / für Befehle, @ für Kontext…`}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t`Nachricht schreiben`}
          disabled={busy}
          data-testid="prompt-draft-input"
        />
        {runActive ? (
          <button
            className="btn btn-circle btn-error shrink-0"
            type="button"
            aria-label={t`Ausführung stoppen`}
            title={t`Ausführung stoppen`}
            data-testid="prompt-stop"
            onClick={onStop}
          >
            <Icon name="stop" />
          </button>
        ) : (
          <button
            className="btn btn-circle btn-primary shrink-0"
            type="submit"
            disabled={!canSend}
            aria-label={t`Nachricht senden`}
            title={
              offline
                ? t`Offline – Senden ist erst wieder möglich, wenn der Server antwortet`
                : t`Nachricht senden`
            }
            data-testid="prompt-send"
          >
            <Icon name="send" />
          </button>
        )}
      </form>
      {/* Composer bar: file picker, workspace-path attach, agent/model chips —
          the pickers are the previous selects, only moved into the composer.
          "Einfach" mode hides the bar: drag & drop still attaches files and the
          mode toggle brings everything back, so nothing becomes unreachable. */}
      {expert && (
      <div className="flex flex-wrap items-center gap-1 pt-1">
        <button
          type="button"
          className="btn btn-xs btn-ghost shrink-0"
          aria-label={t`Dateien auswählen`}
          title={t`Dateien auswählen`}
          data-testid="prompt-attachment-picker"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="plus" /> <Trans>Dateien</Trans>
        </button>
        <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={handlePathSubmit}>
          <input
            className="input input-ghost input-xs min-w-0 flex-1 font-mono"
            placeholder={t`Dateipfad anhängen, z. B. src/app.ts`}
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            aria-label={t`Datei an den Prompt anhängen`}
            disabled={busy}
            data-testid="prompt-attachment-input"
          />
          <button
            type="submit"
            className="btn btn-xs btn-ghost shrink-0"
            disabled={busy || pathDraft.trim() === ""}
            aria-label={t`Datei anhängen`}
            title={t`Datei anhängen`}
            data-testid="prompt-attachment-add"
          >
            <Trans>Anhängen</Trans>
          </button>
        </form>
        <select
          className="select select-ghost select-xs w-auto max-w-32"
          value={currentAgent ?? ""}
          onChange={(event) => onAgentChange(event.target.value)}
          disabled={switching || agents.length === 0 || pickerLoading}
          aria-label={t`Agent der Session`}
          title={t`Agent wählen`}
          data-testid="session-agent-select"
        >
          {pickerLoading ? (
            <option value="">
              <Trans>Lädt…</Trans>
            </option>
          ) : (
            <option value="">
              <Trans>Keiner</Trans>
            </option>
          )}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="select select-ghost select-xs w-auto max-w-40"
          value={currentModelValue}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={switching || models.length === 0 || pickerLoading}
          aria-label={t`Modell der Session`}
          title={t`Modell wählen`}
          data-testid="session-model-select"
        >
          {pickerLoading ? (
            <option value="">
              <Trans>Lädt…</Trans>
            </option>
          ) : (
            <option value="">
              <Trans>Keines</Trans>
            </option>
          )}
          {models.map((m) => {
            const optionValue = modelOptionValue(m);
            return (
              <option key={optionValue} value={optionValue}>
                {m.name}
              </option>
            );
          })}
        </select>
      </div>
      )}
    </div>
  );
}
