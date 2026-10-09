import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Fragment, useState, type ReactNode } from "react";
import Icon from "./Icon.tsx";
import {
  formAnswerFromValues,
  formFieldDefaults,
  toggleMultiselect,
  type FormFieldValue,
} from "../lib/formFields.ts";
import {
  DOCK_KIND_LIMIT,
  splitDockKind,
  type DockForm,
  type DockInboxItem,
  type DockPermission,
  type DockRevert,
  type DockTodo,
} from "../lib/dockStack.ts";

/**
 * The answer that the dock is waiting for. Mirrors the reply endpoint of the
 * tools page: `decision: "once"` (allow once) and `"reject"` (deny).
 * `"always"` is deliberately NOT offered — the documented product decision in
 * `features/05-parity.md` excludes it (it would persist a grant).
 */
export type DockPermissionDecision = "once" | "reject";

export interface SessionDocksProps {
  permissions: DockPermission[];
  forms: DockForm[];
  inbox: DockInboxItem[];
  revert: DockRevert | null;
  /** Always empty today — no todo endpoint exists (see `TodoDock`). */
  todos: DockTodo[];
  /** Any dock action is in flight: every button locks (like the original). */
  busy: boolean;
  offline: boolean;
  onPermissionReply: (requestID: string, decision: DockPermissionDecision) => void;
  onFormSubmit: (formID: string, answer: Record<string, FormFieldValue>) => void;
  onFormCancel: (formID: string) => void;
  onInboxDeliver: (inboxID: string, delivery: "steer" | "queue") => void;
  /** Put a queued entry back into the composer for editing. */
  onInboxEdit: (item: DockInboxItem) => void;
  onRevertCommit: () => void;
  onRevertDiscard: () => void;
}

/** Shared dock shell: one card, the whole width, stacked at 360px. */
function Dock({
  testId,
  icon,
  title,
  children,
  actions,
}: {
  testId: string;
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      className="card bg-base-200 shadow w-full min-w-0"
      data-testid={testId}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div className="card-body py-3 px-4 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-warning">{icon}</span>
          <h3 className="font-semibold text-sm flex-1 min-w-0">{title}</h3>
          {actions}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * The "N weitere anzeigen" / "Weniger anzeigen" row that caps one dock kind at
 * {@link DOCK_KIND_LIMIT} entries. It expands or collapses the hidden tail in
 * place — the newest entries never move. Rendered only when a kind actually
 * overflows the limit.
 */
function DockMoreRow({
  hidden,
  expanded,
  onToggle,
  testId,
}: {
  hidden: number;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
}) {
  // Lingui-safe hoist: no member access inside a message.
  const hiddenCount = hidden;
  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost w-full justify-start gap-1 text-xs opacity-70"
      aria-expanded={expanded}
      data-testid={testId}
      onClick={onToggle}
    >
      <Icon name="chevron" className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
      {expanded ? <Trans>Weniger anzeigen</Trans> : <Trans>{hiddenCount} weitere anzeigen</Trans>}
    </button>
  );
}

/**
 * Renders one dock kind's cards: the newest {@link DOCK_KIND_LIMIT} first, the
 * older ones collapsed behind a {@link DockMoreRow} until it is expanded in
 * place. Each dock type keeps its own card — this only governs how many show at
 * once so a busy stack cannot push the composer off-screen. A kind at or below
 * the limit renders every entry with no toggle.
 */
function DockEntryGroup<T extends { id: string }>({
  testId,
  entries,
  children,
}: {
  testId: string;
  entries: readonly T[];
  children: (entry: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { visible, hidden } = splitDockKind(entries);
  const shown = expanded ? entries : visible;
  return (
    <>
      {shown.map((entry) => (
        <Fragment key={entry.id}>{children(entry)}</Fragment>
      ))}
      {entries.length > DOCK_KIND_LIMIT && (
        <DockMoreRow
          hidden={hidden}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          testId={testId}
        />
      )}
    </>
  );
}

/** One pending permission request: description, patterns, deny + allow once. */
function PermissionDock({
  request,
  busy,
  offline,
  onReply,
}: {
  request: DockPermission;
  busy: boolean;
  offline: boolean;
  onReply: (decision: DockPermissionDecision) => void;
}) {
  const disabled = busy || offline;
  const actionLabel = request.action;
  // Lingui-safe hoists: no member access inside a message.
  const requestID = request.id;
  const rejectLabel = t`Anfrage ${requestID} ablehnen`;
  const onceLabel = t`Anfrage ${requestID} einmalig erlauben`;
  return (
    <Dock
      testId={`session-dock-permission-${request.id}`}
      icon={<Icon name="bell" className="size-4" />}
      title={<Trans>Berechtigung angefragt: {actionLabel}</Trans>}
    >
      {request.message !== null && (
        <p className="text-sm opacity-80 break-words" data-testid="session-dock-permission-message">
          {request.message}
        </p>
      )}
      {request.resources.length > 0 && (
        <ul className="flex flex-wrap gap-1" data-testid={`session-dock-permission-resources-${requestID}`}>
          {request.resources.map((resource) => (
            <li key={resource}>
              <code className="text-xs bg-base-300 rounded px-1 py-0.5 break-all">{resource}</code>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-error btn-outline"
          disabled={disabled}
          aria-label={rejectLabel}
          data-testid={`session-dock-permission-reject-${requestID}`}
          onClick={() => onReply("reject")}
        >
          <Trans>Ablehnen</Trans>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={disabled}
          aria-label={onceLabel}
          data-testid={`session-dock-permission-once-${requestID}`}
          onClick={() => onReply("once")}
        >
          <Trans>Einmal erlauben</Trans>
        </button>
      </div>
      {/* Extension point (documented product decision, `features/05-parity.md`):
          `decision: "always"` would persist a grant and is therefore NOT offered
          here. To ship it later, add `"always"` to `DockPermissionDecision`, a
          button next to "Einmal erlauben" and the pending-request list must
          re-read `permission.saved` so the dock can show what is already
          granted permanently. */}
    </Dock>
  );
}

/** One native control per parsed form field. */
function FormFieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: DockForm["fields"][number];
  value: FormFieldValue | undefined;
  disabled: boolean;
  onChange: (next: FormFieldValue) => void;
}) {
  const descriptionId = field.description === null ? undefined : `${field.key}-hint`;
  // Lingui-safe hoist: no member access inside a message.
  const fieldLabel = field.label;
  switch (field.kind) {
    case "text": {
      if (field.options !== null) {
        return (
          <div className="join w-full" role="radiogroup" aria-label={field.label}>
            {field.options.map((option) => {
              const picked = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={`btn btn-sm join-item flex-1 min-w-0 ${picked ? "btn-primary" : "btn-ghost"}`}
                  disabled={disabled}
                  title={option.description ?? option.label}
                  data-testid={`session-dock-form-option-${field.key}-${option.value}`}
                  onClick={() => onChange(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        );
      }
      return (
        <input
          className="input input-bordered input-sm w-full"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          aria-label={field.label}
          aria-describedby={descriptionId}
          data-testid={`session-dock-form-input-${field.key}`}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }
    case "number":
      return (
        <input
          type="number"
          className="input input-bordered input-sm w-full sm:w-40"
          value={typeof value === "number" ? value : ""}
          disabled={disabled}
          aria-label={field.label}
          aria-describedby={descriptionId}
          data-testid={`session-dock-form-input-${field.key}`}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
      );
    case "boolean":
      return (
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={value === true}
            disabled={disabled}
            aria-label={field.label}
            data-testid={`session-dock-form-check-${field.key}`}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="label-text">{field.label}</span>
        </label>
      );
    case "multiselect":
      return (
        <div className="flex flex-col gap-1" data-testid={`session-dock-form-multi-${field.key}`}>
          {field.options.map((option) => {
            const picked = Array.isArray(value) && value.includes(option.value);
            return (
              <label key={option.value} className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={picked}
                  disabled={disabled}
                  aria-label={option.label}
                  data-testid={`session-dock-form-multi-${field.key}-${option.value}`}
                  onChange={() => onChange(toggleMultiselect(value, option.value))}
                />
                <span className="label-text">{option.label}</span>
              </label>
            );
          })}
        </div>
      );
    case "external":
      return (
        <a
          className="link link-primary text-sm break-all"
          href={field.url}
          target="_blank"
          rel="noreferrer noopener"
          data-testid={`session-dock-form-external-${field.key}`}
        >
          <Trans>Antwort auf {fieldLabel} öffnen</Trans>
        </a>
      );
  }
}

/** One pending form ("question"): native controls first, JSON as escape hatch. */
function QuestionDock({
  form,
  busy,
  offline,
  onSubmit,
  onCancel,
}: {
  form: DockForm;
  busy: boolean;
  offline: boolean;
  onSubmit: (answer: Record<string, FormFieldValue>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, FormFieldValue>>(() =>
    formFieldDefaults(form.fields),
  );
  const answerable = form.fields.filter((field) => field.kind !== "external");
  const answer = formAnswerFromValues(form.fields, values);
  const empty = Object.keys(answer).length === 0;
  const disabled = busy || offline;
  // Lingui-safe hoists: no member access inside a message.
  const formID = form.id;
  const rejectLabel = t`Formular ${formID} ablehnen`;
  const submitLabel = t`Formular ${formID} beantworten`;

  return (
    <Dock
      testId={`session-dock-question-${formID}`}
      icon={<Icon name="question" className="size-4" />}
      title={form.title}
    >
      <div className="flex flex-col gap-3">
        {form.fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1 min-w-0">
            {field.kind !== "boolean" && (
              <span className="text-sm font-medium">
                {field.label}
                {field.required && <span className="text-error"> *</span>}
              </span>
            )}
            {field.description !== null && (
              <span className="text-xs opacity-70" id={`${field.key}-hint`}>
                {field.description}
              </span>
            )}
            <FormFieldControl
              field={field}
              value={values[field.key]}
              disabled={disabled}
              onChange={(next) => setValues((prev) => ({ ...prev, [field.key]: next }))}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-error btn-outline"
          disabled={disabled}
          aria-label={rejectLabel}
          data-testid={`session-dock-question-cancel-${formID}`}
          onClick={onCancel}
        >
          <Trans>Ablehnen</Trans>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={disabled || empty || answerable.length === 0}
          aria-label={submitLabel}
          data-testid={`session-dock-question-submit-${formID}`}
          onClick={() => onSubmit(answer)}
        >
          <Trans>Antworten</Trans>
        </button>
      </div>
      {/* Escape hatch for field types the native controls do not cover (or for
          pasting a whole answer object): the same JSON shape the tools page
          uses. The happy path never needs it. */}
      <details data-testid={`session-dock-question-json-${formID}`}>
        <summary className="cursor-pointer text-xs opacity-70">
          <Trans>Als JSON bearbeiten</Trans>
        </summary>
        <form
          className="flex flex-col gap-2 mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const raw = String(data.get(`json-${formID}`) ?? "");
            try {
              const parsed: unknown = JSON.parse(raw);
              if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                onSubmit(parsed as Record<string, FormFieldValue>);
              }
            } catch {
              // Invalid JSON: nothing is sent; the native controls stay.
            }
          }}
        >
          <textarea
            className="textarea textarea-bordered font-mono text-xs w-full"
            rows={3}
            defaultValue={JSON.stringify(answer, null, 2)}
            aria-label={t`Antwort als JSON`}
            name={`json-${formID}`}
            data-testid={`session-dock-question-json-text-${formID}`}
          />
          <button
            type="submit"
            className="btn btn-sm btn-ghost w-fit"
            disabled={disabled || answerable.length === 0}
            aria-label={t`JSON-Antwort senden`}
            data-testid={`session-dock-question-json-submit-${formID}`}
          >
            <Trans>JSON senden</Trans>
          </button>
        </form>
      </details>
    </Dock>
  );
}

/** Queued inbox / follow-up entries: send now, queue, edit in the composer. */
function InboxDock({
  items,
  busy,
  offline,
  onDeliver,
  onEdit,
}: {
  items: DockInboxItem[];
  busy: boolean;
  offline: boolean;
  onDeliver: (inboxID: string, delivery: "steer" | "queue") => void;
  onEdit: (item: DockInboxItem) => void;
}) {
  const disabled = busy || offline;
  const [expanded, setExpanded] = useState(false);
  // Cap the queued rows per kind (newest {@link DOCK_KIND_LIMIT} show), so a
  // long queue does not dominate the stack; the rest expand in place.
  const { visible, hidden } = splitDockKind(items);
  const shown = expanded ? items : visible;
  const total = items.length;
  return (
    <Dock
      testId="session-dock-inbox"
      icon={<Icon name="list" className="size-4" />}
      title={
        <Trans>Warteschlange ({total})</Trans>
      }
    >
      <ul className="flex flex-col gap-2" data-testid="session-dock-inbox-list">
        {shown.map((item) => {
          // Lingui-safe hoists: no member access inside a message.
          const itemID = item.id;
          const steerLabel = t`Eintrag ${itemID} sofort ausführen`;
          const queueLabel = t`Eintrag ${itemID} in die Warteschlange legen`;
          const editLabel = t`Eintrag ${itemID} zum Bearbeiten laden`;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-2 min-w-0"
              data-testid={`session-dock-inbox-${itemID}`}
            >
              {/* Text row: the kind badge sits inline with the summary (never a
                  fixed narrow column), the summary takes the full remaining
                  width and wraps normally — no per-word break at 360px. The
                  action buttons move to their own row below so they cannot
                  squeeze the text into a sliver. */}
              <div className="flex items-start gap-2 min-w-0">
                <span
                  className="badge badge-ghost badge-sm shrink-0"
                  data-testid={`session-dock-inbox-kind-${itemID}`}
                >
                  {item.kind}
                </span>
                <span
                  className="flex-1 min-w-0 text-sm break-words"
                  data-testid={`session-dock-inbox-summary-${itemID}`}
                >
                  {item.summary}
                </span>
                {item.delivery !== null && (
                  <span
                    className="badge badge-info badge-sm shrink-0"
                    data-testid={`session-dock-inbox-delivery-${itemID}`}
                  >
                    {item.delivery === "steer" ? <Trans>sofort</Trans> : <Trans>Warteschlange</Trans>}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  disabled={disabled}
                  aria-label={steerLabel}
                  data-testid={`session-dock-inbox-steer-${itemID}`}
                  onClick={() => onDeliver(itemID, "steer")}
                >
                  <Trans>Sofort</Trans>
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  disabled={disabled}
                  aria-label={queueLabel}
                  data-testid={`session-dock-inbox-queue-${itemID}`}
                  onClick={() => onDeliver(itemID, "queue")}
                >
                  <Trans>Warten</Trans>
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  disabled={disabled}
                  aria-label={editLabel}
                  data-testid={`session-dock-inbox-edit-${itemID}`}
                  onClick={() => onEdit(item)}
                >
                  <Icon name="edit" className="size-3" /> <Trans>Bearbeiten</Trans>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {total > DOCK_KIND_LIMIT && (
        <DockMoreRow
          hidden={hidden}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          testId="session-docks-more-inbox"
        />
      )}
    </Dock>
  );
}

/** A staged revert: summary plus restore (with confirm) and discard. */
function RevertDock({
  revert,
  busy,
  offline,
  onCommit,
  onDiscard,
}: {
  revert: DockRevert;
  busy: boolean;
  offline: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}) {
  const disabled = busy || offline;
  const stagedMessageID = revert.messageID;
  const stagedFileCount = revert.fileCount;
  return (
    <Dock
      testId="session-dock-revert"
      icon={<Icon name="branch" className="size-4" />}
      title={<Trans>Rückgängig vorgemerkt</Trans>}
    >
      <p className="text-sm" data-testid="session-dock-revert-summary">
        {stagedFileCount === null ? (
          <Trans>Staged ab Nachricht {stagedMessageID}.</Trans>
        ) : (
          <Trans>Staged ab Nachricht {stagedMessageID} ({stagedFileCount} Dateien).</Trans>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={disabled}
          aria-label={t`Revert übernehmen`}
          data-testid="session-dock-revert-commit"
          onClick={onCommit}
        >
          <Trans>Übernehmen</Trans>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={disabled}
          aria-label={t`Revert-Staging verwerfen`}
          data-testid="session-dock-revert-discard"
          onClick={onDiscard}
        >
          <Trans>Verwerfen</Trans>
        </button>
      </div>
    </Dock>
  );
}

/**
 * Collapsible todo dock. Renders only when the API surfaces todos — today it
 * never does (no todo endpoint exists in the installed client), so this is the
 * documented extension point: as soon as a list endpoint appears, one
 * `dispatch({ type: "todos", rows })` in `useSessionDocks` is enough.
 */
function TodoDock({ todos }: { todos: DockTodo[] }) {
  const [open, setOpen] = useState(true);
  const done = todos.filter((todo) => todo.status === "completed").length;
  const total = todos.length;
  const doneLabel = done;
  const totalLabel = total;
  return (
    <Dock
      testId="session-dock-todos"
      icon={<Icon name="todos" className="size-4" />}
      title={
        <Trans>
          Aufgaben ({doneLabel}/{totalLabel})
        </Trans>
      }
      actions={
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          aria-expanded={open}
          aria-label={open ? t`Aufgaben einklappen` : t`Aufgaben ausklappen`}
          data-testid="session-dock-todos-toggle"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <Trans>Einklappen</Trans> : <Trans>Ausklappen</Trans>}
        </button>
      }
    >
      {open && (
        <ul className="flex flex-col gap-1" data-testid="session-dock-todos-list">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`text-sm break-words ${
                todo.status === "completed" || todo.status === "cancelled" ? "line-through opacity-70" : ""
              }`}
              data-state={todo.status}
              data-testid={`session-dock-todo-${todo.id}`}
            >
              {todo.status === "in_progress" && (
                <span className="badge badge-primary badge-sm mr-1">
                  <Trans>läuft</Trans>
                </span>
              )}
              {todo.content}
            </li>
          ))}
        </ul>
      )}
    </Dock>
  );
}

/**
 * The dock stack directly above the composer. Order is the original's: the
 * question (form) first, then the permission request, the staged revert and
 * the queued follow-ups. Every dock stacks vertically at 360px — the stack is a
 * plain flex column, so nothing is ever cut off or scrolled sideways.
 *
 * A kind with more than {@link DOCK_KIND_LIMIT} entries is capped: its newest
 * {@link DOCK_KIND_LIMIT} show and the rest collapse behind a "N weitere
 * anzeigen" row that expands in place (see {@link DockEntryGroup} /
 * {@link InboxDock}). Revert and todo stay single docks.
 *
 * A dock with no content renders nothing at all.
 */
export default function SessionDocks({
  permissions,
  forms,
  inbox,
  revert,
  todos,
  busy,
  offline,
  onPermissionReply,
  onFormSubmit,
  onFormCancel,
  onInboxDeliver,
  onInboxEdit,
  onRevertCommit,
  onRevertDiscard,
}: SessionDocksProps) {
  const hasAnything =
    forms.length > 0 ||
    permissions.length > 0 ||
    revert !== null ||
    inbox.length > 0 ||
    todos.length > 0;
  if (!hasAnything) return null;
  return (
    <div className="flex flex-col gap-2 w-full min-w-0" data-testid="session-docks">
      {forms.length > 0 && (
        <DockEntryGroup testId="session-docks-more-forms" entries={forms}>
          {(form) => (
            <QuestionDock
              form={form}
              busy={busy}
              offline={offline}
              onSubmit={(answer) => onFormSubmit(form.id, answer)}
              onCancel={() => onFormCancel(form.id)}
            />
          )}
        </DockEntryGroup>
      )}
      {permissions.length > 0 && (
        <DockEntryGroup testId="session-docks-more-permissions" entries={permissions}>
          {(request) => (
            <PermissionDock
              request={request}
              busy={busy}
              offline={offline}
              onReply={(decision) => onPermissionReply(request.id, decision)}
            />
          )}
        </DockEntryGroup>
      )}
      {revert !== null && (
        <RevertDock
          revert={revert}
          busy={busy}
          offline={offline}
          onCommit={onRevertCommit}
          onDiscard={onRevertDiscard}
        />
      )}
      {inbox.length > 0 && (
        <InboxDock
          items={inbox}
          busy={busy}
          offline={offline}
          onDeliver={onInboxDeliver}
          onEdit={onInboxEdit}
        />
      )}
      {todos.length > 0 && <TodoDock todos={todos} />}
    </div>
  );
}
