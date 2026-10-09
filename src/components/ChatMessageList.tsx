import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { memo, useRef, useState } from "react";
import CopyButton from "./CopyButton.tsx";
import Icon from "./Icon.tsx";
import Markdown from "./Markdown.tsx";
import {
  formatChatTime,
  resolveModelLabel,
  type ChatNoteKind,
  type ChatPart,
  type ChatReasoningPart,
  type ChatTextPart,
  type ChatToolPart,
} from "../lib/sessionMessages.ts";
import {
  groupChatMessages,
  type ChatBubbleRow,
  type ChatDayLabelKind,
} from "../lib/chatGrouping.ts";
import {
  getToolInfo,
  isContextGroupTool,
  isHiddenTool,
  type ToolInfo,
} from "../lib/toolInfo.ts";
import type { CachedMessage } from "../lib/messageCache.ts";

/**
 * Chat-first conversation view for SessionDetail. User messages render right
 * (primary bubble), assistant messages left (neutral bubble); system, idle,
 * compaction and every other status render as subtle centered notes — never
 * as bubbles and never as raw JSON. Unknown future part types degrade to a
 * small "unbekannter Inhalt" note.
 *
 * Messenger layout (wave 6, parity with the original's `session-turn` /
 * `message-timeline`): day separators ("Heute"/"Gestern"/date) between days,
 * consecutive messages of the same role grouped (tighter spacing, one meta
 * line and timestamp per group, a bubble tail on the last message of a group),
 * and quick actions (copy, revert-to-message) revealed on hover (desktop) and
 * long-press (touch). Assistant *text* becomes its own bubble while tool cards
 * stay cards. Timestamps stay subtle, and everything fits 360px.
 */

function NoteHeadline({ kind, detail }: { kind: ChatNoteKind; detail: string | null }) {
  if (kind === "system") return <Trans>System</Trans>;
  if (kind === "synthetic") return <Trans>Hinweis</Trans>;
  if (kind === "skill") return <Trans>Skill</Trans>;
  if (kind === "shell") return <Trans>Terminal</Trans>;
  if (kind === "compaction") {
    if (detail === "running") return <Trans>Kompaktierung läuft …</Trans>;
    if (detail === "failed") return <Trans>Kompaktierung fehlgeschlagen</Trans>;
    return <Trans>Kompaktierung</Trans>;
  }
  if (kind === "idle") {
    if (detail === "failed") return <Trans>Leerlauf (fehlgeschlagen)</Trans>;
    if (detail === "interrupted") return <Trans>Leerlauf (unterbrochen)</Trans>;
    return <Trans>Leerlauf</Trans>;
  }
  if (kind === "agent") return <Trans>Agent gewechselt</Trans>;
  if (kind === "model") return <Trans>Modell gewechselt</Trans>;
  if (kind === "location") return <Trans>Verzeichnis gewechselt</Trans>;
  return <Trans>Hinweis</Trans>;
}

/** German label of a tool card (parity with the original's `ui.tool.*` keys). */
function ToolLabel({ info }: { info: ToolInfo }) {
  switch (info.labelKey) {
    case "read":
      return <Trans>Lesen</Trans>;
    case "list":
      return <Trans>Auflisten</Trans>;
    case "glob":
      return <Trans>Glob</Trans>;
    case "grep":
      return <Trans>Grep</Trans>;
    case "webfetch":
      return <Trans>Web-Abruf</Trans>;
    case "websearch":
      return <Trans>Web-Suche</Trans>;
    case "task":
      return <Trans>Aufgabe</Trans>;
    case "subagent":
      return <Trans>Subagent</Trans>;
    case "shell":
      return <Trans>Shell</Trans>;
    case "edit":
      return <Trans>Bearbeiten</Trans>;
    case "write":
      return <Trans>Schreiben</Trans>;
    case "patch":
      return <Trans>Patch</Trans>;
    case "todos":
      return <Trans>Aufgaben</Trans>;
    case "todosRead":
      return <Trans>Aufgaben lesen</Trans>;
    case "question":
      return <Trans>Fragen</Trans>;
    case "skill":
      return <Trans>Skill</Trans>;
    default:
      return null;
  }
}

function ToolStatusBadge({ status }: { status: string }) {
  if (status === "error")
    return (
      <span className="badge badge-error badge-sm">
        <Trans>Fehler</Trans>
      </span>
    );
  if (status === "completed")
    return (
      <span className="badge badge-success badge-sm">
        <Trans>Fertig</Trans>
      </span>
    );
  if (status === "running" || status === "streaming")
    return (
      <span className="badge badge-info badge-sm">
        <Trans>Läuft</Trans>
      </span>
    );
  return null;
}

/** Aggregate status of a group of tool calls: worst state wins. */
function groupStatus(parts: ChatToolPart[]): string {
  if (parts.some((part) => part.status === "error")) return "error";
  if (parts.some((part) => part.status === "streaming" || part.status === "running")) return "running";
  if (parts.every((part) => part.status === "completed")) return "completed";
  return "unknown";
}

/**
 * Trailing caret of a part a `session.*.delta` frame is still appending to. It
 * is the only thing that separates a growing answer from a finished one: the
 * text itself is identical, and the caret disappears the moment the
 * authoritative snapshot replaces the row (a reload never shows one).
 */
function StreamCaret({ messageID, partIndex }: { messageID: string; partIndex: number }) {
  return (
    <span
      className="stream-caret"
      aria-hidden="true"
      data-testid={`stream-caret-${messageID}-${partIndex}`}
    />
  );
}

/** True while the stream is still appending to a text/reasoning part. */
function isLive(part: ChatTextPart | ChatReasoningPart): boolean {
  return part.live === true;
}

/**
 * Reasoning block ("ich möchte das denken sehen"): while the stream appends to
 * it the block is forced open, so the reasoning is visible as it grows instead
 * of hiding behind "Denken anzeigen". Once the turn is over the part loses its
 * `live` marker and collapses back to the calm default.
 */
function ReasoningPart({
  messageID,
  partIndex,
  part,
}: {
  messageID: string;
  partIndex: number;
  part: ChatReasoningPart;
}) {
  const live = isLive(part);
  const [expanded, setExpanded] = useState(false);
  const open = live || expanded;
  return (
    <details
      className="opacity-80 text-sm"
      data-testid={`message-reasoning-${messageID}-${partIndex}`}
      data-live={live ? "true" : "false"}
      open={open}
      onToggle={(event) => {
        // Opening the block programmatically fires `toggle` as well. Ignoring
        // a toggle that merely confirms what was just rendered keeps it from
        // latching the block open after the stream ended.
        if (event.currentTarget.open === open) return;
        setExpanded(event.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer">
        <Trans>Denken anzeigen</Trans>
      </summary>
      <div className="whitespace-pre-wrap break-words mt-1">
        <Markdown text={part.text} />
        {live && <StreamCaret messageID={messageID} partIndex={partIndex} />}
      </div>
    </details>
  );
}

/** A text part (or the answer bubble around one) with its optional caret. */
function TextBody({
  messageID,
  partIndex,
  part,
  className,
}: {
  messageID: string;
  partIndex: number;
  part: ChatTextPart;
  className: string;
}) {
  const live = isLive(part);
  return (
    <div className={className} data-live={live ? "true" : "false"}>
      <Markdown text={part.text} />
      {live && <StreamCaret messageID={messageID} partIndex={partIndex} />}
    </div>
  );
}

function ToolArgChips({ args }: { args: string[] }) {
  if (args.length === 0) return null;
  return (
    <>
      {args.map((arg) => (
        <span
          key={arg}
          className="badge badge-ghost badge-sm font-mono font-normal max-w-40 truncate"
          title={arg}
        >
          {arg}
        </span>
      ))}
    </>
  );
}

/** +/- change badges of edit-type tools (lines added / removed). */
function ChangeBadges({ info }: { info: ToolInfo }) {
  if (info.changes === null) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-mono tabular-nums shrink-0">
      {info.changes.additions > 0 && (
        <span className="text-success" title={t`Hinzugefügte Zeilen`}>
          +{info.changes.additions}
        </span>
      )}
      {info.changes.deletions > 0 && (
        <span className="text-error" title={t`Entfernte Zeilen`}>
          −{info.changes.deletions}
        </span>
      )}
    </span>
  );
}

function ToolDetail({ text, testid }: { text: string; testid: string }) {
  return (
    <div className="relative mt-1">
      <CopyButton text={text} testid={testid} className="absolute right-1 top-1 z-10" />
      <pre className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto pr-10">{text}</pre>
    </div>
  );
}

/** One tool call as a card: icon + label + subtitle + chips + status. */
function ToolCard({
  messageID,
  partIndex,
  part,
}: {
  messageID: string;
  partIndex: number;
  part: ChatToolPart;
}) {
  const info = getToolInfo(part.name, part.input, part.metadata);
  const pending = part.status === "streaming" || part.status === "running";
  const failed = part.status === "error";
  const hasDetail = part.detail !== null;
  const cardClass = failed
    ? "card rounded border border-error/50 bg-error/10 p-2 mt-1"
    : "card bg-base-300/60 rounded p-2 mt-1";
  // Lingui messages take plain variables only (no member access in messages),
  // so the interpolated values are hoisted out of the <Trans> body.
  const toolName = part.name;
  const errorDetail = part.detail ?? "";
  return (
    <details
      className={cardClass}
      data-testid={`message-tool-${messageID}-${partIndex}`}
      data-tool={part.name}
      data-status={part.status}
    >
      <summary className="cursor-pointer text-sm flex flex-wrap items-center gap-2">
        <Icon name={info.icon} className="shrink-0" />
        <span className={`flex items-center gap-1 min-w-0${pending ? " tool-title-shimmer" : ""}`}>
          {info.provider !== null && <span className="opacity-70">{info.provider}</span>}
          <ToolLabel info={info} />
          {info.labelKey === null && <span className="font-mono">{part.name}</span>}
        </span>
        {info.subtitle !== null && (
          <>
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
            <span className="font-mono break-all" title={info.subtitle}>
              {info.subtitle}
            </span>
          </>
        )}
        <ToolArgChips args={info.args} />
        <ChangeBadges info={info} />
        <span className="flex-1" />
        <ToolStatusBadge status={part.status} />
        {(hasDetail || failed) && <Icon name="chevron" className="tool-chevron opacity-60" />}
      </summary>
      {(hasDetail || failed) && (
        <div className="tool-card-content">
          {failed && (
            <p className="mt-1 text-xs font-semibold text-error">
              <Trans>Fehler beim Aufruf von {toolName}</Trans>
            </p>
          )}
          {hasDetail && (
            <ToolDetail
              text={errorDetail}
              testid={`message-tool-copy-${messageID}-${partIndex}`}
            />
          )}
        </div>
      )}
    </details>
  );
}

/**
 * Collapsed summary row for consecutive read/glob/grep/list calls — one line
 * ("N Lesevorgänge · M Suchen") that expands to the individual calls.
 */
function ContextToolGroup({
  messageID,
  partIndex,
  parts,
}: {
  messageID: string;
  partIndex: number;
  parts: Array<{ partIndex: number; part: ChatToolPart }>;
}) {
  const pending = parts.some(
    (entry) => entry.part.status === "streaming" || entry.part.status === "running",
  );
  const count = (names: readonly string[]) =>
    parts.filter((entry) => names.includes(entry.part.name)).length;
  const reads = count(["read"]);
  const searches = count(["glob", "grep"]);
  const lists = count(["list"]);
  return (
    <details
      className="card bg-base-300/40 rounded p-2 mt-1"
      data-testid={`message-tool-group-${messageID}-${partIndex}`}
    >
      <summary className="cursor-pointer text-sm flex flex-wrap items-center gap-2">
        <Icon name="search" className="shrink-0" />
        <span className={pending ? "tool-title-shimmer" : undefined}>
          {pending ? <Trans>Wird erkundet</Trans> : <Trans>Erkundung abgeschlossen</Trans>}
        </span>
        <span className="opacity-60">·</span>
        <span className="opacity-80">
          {reads > 0 &&
            (reads === 1 ? <Trans>1 Lesevorgang</Trans> : <Trans>{reads} Lesevorgänge</Trans>)}
          {searches > 0 && (
            <>
              {reads > 0 && " · "}
              {searches === 1 ? <Trans>1 Suche</Trans> : <Trans>{searches} Suchen</Trans>}
            </>
          )}
          {lists > 0 && (
            <>
              {(reads > 0 || searches > 0) && " · "}
              {lists === 1 ? <Trans>1 Liste</Trans> : <Trans>{lists} Listen</Trans>}
            </>
          )}
        </span>
        <span className="flex-1" />
        <ToolStatusBadge status={groupStatus(parts.map((entry) => entry.part))} />
        <Icon name="chevron" className="tool-chevron opacity-60" />
      </summary>
      <div className="tool-card-content flex flex-col gap-1 mt-1">
        {parts.map((entry) => {
          const info = getToolInfo(entry.part.name, entry.part.input, entry.part.metadata);
          const entryPending =
            entry.part.status === "streaming" || entry.part.status === "running";
          return (
            <div
              key={entry.partIndex}
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid={`message-tool-${messageID}-${entry.partIndex}`}
              data-tool={entry.part.name}
              data-status={entry.part.status}
            >
              <Icon name={info.icon} className="shrink-0 opacity-80" />
              <span className={`flex items-center gap-1${entryPending ? " tool-title-shimmer" : ""}`}>
                <ToolLabel info={info} />
                {info.labelKey === null && <span className="font-mono">{entry.part.name}</span>}
              </span>
              {info.subtitle !== null && (
                <>
                  <span aria-hidden="true" className="opacity-50">
                    ·
                  </span>
                  <span className="font-mono break-all" title={info.subtitle}>
                    {info.subtitle}
                  </span>
                </>
              )}
              <ToolArgChips args={info.args} />
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Flatten parts into render rows: single parts and collapsed context groups. */
type RenderRow =
  | { kind: "part"; partIndex: number; part: ChatPart }
  | {
      kind: "group";
      partIndex: number;
      parts: Array<{ partIndex: number; part: ChatToolPart }>;
    };

/**
 * Errored calls never fold into the summary row: they keep their own error
 * card so the failure stays visible (the original hides them inside the
 * collapsed group, which reads as "nothing happened").
 */
function groupsIntoSummary(part: ChatToolPart): boolean {
  return isContextGroupTool(part.name) && part.status !== "error";
}

function renderRows(parts: ChatPart[]): RenderRow[] {
  const rows: RenderRow[] = [];
  let run: Array<{ partIndex: number; part: ChatToolPart }> = [];
  function flush(): void {
    if (run.length === 0) return;
    rows.push({ kind: "group", partIndex: run[0]?.partIndex ?? 0, parts: run });
    run = [];
  }
  parts.forEach((part, index) => {
    if (part.kind === "tool" && isHiddenTool(part.name)) return;
    if (part.kind === "tool" && groupsIntoSummary(part)) {
      run.push({ partIndex: index, part });
      return;
    }
    flush();
    rows.push({ kind: "part", partIndex: index, part });
  });
  flush();
  return rows;
}

function PartView({
  messageID,
  part,
  partIndex,
}: {
  messageID: string;
  part: ChatPart;
  partIndex: number;
}) {
  if (part.kind === "text") {
    return (
      <TextBody
        messageID={messageID}
        partIndex={partIndex}
        part={part}
        className="whitespace-pre-wrap break-words"
      />
    );
  }
  if (part.kind === "reasoning") {
    return <ReasoningPart messageID={messageID} partIndex={partIndex} part={part} />;
  }
  if (part.kind === "tool") {
    return <ToolCard messageID={messageID} partIndex={partIndex} part={part} />;
  }
  if (part.kind === "files") {
    const VISIBLE_FILES = 5;
    const head = part.files.slice(0, VISIBLE_FILES);
    const tail = part.files.slice(VISIBLE_FILES);
    const hiddenCount = tail.length;
    return (
      <div
        className="mt-1 text-sm max-h-40 overflow-auto"
        data-testid={`message-files-${messageID}-${partIndex}`}
      >
        <ul className="flex flex-col gap-1">
          {head.map((file) => (
            <li key={file} className="flex items-center gap-1 opacity-80">
              <Icon name="file" />
              <span className="font-mono break-all">{file}</span>
            </li>
          ))}
        </ul>
        {tail.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs opacity-70">
              <Trans>{hiddenCount} weitere anzeigen</Trans>
            </summary>
            <ul className="flex flex-col gap-1 mt-1">
              {tail.map((file) => (
                <li key={file} className="flex items-center gap-1 opacity-80">
                  <Icon name="file" />
                  <span className="font-mono break-all">{file}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  return (
    <p className="text-xs opacity-70" data-testid={`message-unknown-${messageID}-${partIndex}`}>
      <Trans>Unbekannter Inhalt – wird in einer künftigen Version angezeigt.</Trans>
    </p>
  );
}

/** Turn duration of a finished assistant message ("2,5 s" / "1m 4s"). */
function turnDurationLabel(durationMs: number): string {
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 60) {
    const seconds = totalSeconds.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    return t`${seconds} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return t`${minutes}m ${seconds}s`;
}

/** `agent · model` prefix of the chat chrome, or null when nothing is known. */
function metaHead(
  agent: string | null,
  model: string | null,
  modelNames: Readonly<Record<string, string>>,
): string | null {
  const label = resolveModelLabel(model, modelNames);
  const items = [agent, label].filter((value): value is string => value !== null);
  return items.length === 0 ? null : items.join(" · ");
}

/** Legacy cache rows carry no parts: fall back to the plain stored text
 *  (already scrubbed of JSON dumps on read), else an unknown note. */
function messageParts(message: CachedMessage): ChatPart[] {
  const storedParts = message.parts ?? [];
  if (storedParts.length > 0) return storedParts;
  if (message.text !== "") return [{ kind: "text", text: message.text } as const];
  return [{ kind: "unknown" } as const];
}

/** Day separator between days ("Heute" / "Gestern" / date). */
function DaySeparator({ label, date }: { label: ChatDayLabelKind; date: string }) {
  return (
    <li
      className="flex items-center gap-2 my-1"
      data-testid="message-day-separator"
      data-day={label}
      role="separator"
    >
      <span className="h-px flex-1 bg-base-300" aria-hidden="true" />
      <span className="oc-micro uppercase tracking-wide opacity-60 shrink-0">
        {label === "today" ? (
          <Trans>Heute</Trans>
        ) : label === "yesterday" ? (
          <Trans>Gestern</Trans>
        ) : (
          date
        )}
      </span>
      <span className="h-px flex-1 bg-base-300" aria-hidden="true" />
    </li>
  );
}

const LONG_PRESS_MS = 450;

/**
 * Quick actions of one message (copy, revert-to-message). Revealed on
 * hover/focus (desktop, pure CSS) and on long-press (touch, state below); the
 * buttons always exist in the DOM so keyboard users reach them via Tab.
 */
function MessageActions({
  messageID,
  copyText,
  revertable,
  onRevert,
  shown,
}: {
  messageID: string;
  copyText: string;
  revertable: boolean;
  onRevert?: (messageID: string) => void;
  shown: boolean;
}) {
  if (copyText === "" && !revertable) return null;
  return (
    <div
      className={`absolute bottom-0 translate-y-full pt-1 flex items-center gap-1 ${
        shown ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100"
      } transition-opacity`}
      data-testid={`message-actions-${messageID}`}
      data-shown={shown ? "true" : "false"}
    >
      {copyText !== "" && (
        <CopyButton text={copyText} testid={`message-copy-${messageID}`} className="opacity-70" />
      )}
      {revertable && onRevert !== undefined && (
        <button
          type="button"
          className="btn btn-ghost btn-xs opacity-70 hover:opacity-100"
          title={t`Auf diesen Stand zurücksetzen`}
          aria-label={t`Auf diesen Stand zurücksetzen`}
          data-testid={`message-revert-${messageID}`}
          onClick={() => onRevert(messageID)}
        >
          <Icon name="refresh" />
        </button>
      )}
    </div>
  );
}

/**
 * One chat message. `own` aligns right and paints one primary bubble (text +
 * attachments together); assistant messages give every text part its own
 * neutral bubble while tool cards stay cards. Quick actions (copy, revert)
 * reveal on hover (desktop) and long-press (touch).
 *
 * Memoized on the *identity* of `row.message`: a streaming frame replaces the
 * one row it grows and leaves every other message object untouched, so the
 * comparator below skips re-rendering the whole list per frame (measured load:
 * 92 frames in 12 s). `groupChatMessages` rebuilds its row objects on every
 * call, so the default shallow compare would never hit.
 */
const MessageBubble = memo(
  function MessageBubble({
    row,
    modelNames,
    onRevert,
  }: {
    row: ChatBubbleRow;
    modelNames: Readonly<Record<string, string>>;
    onRevert?: (messageID: string) => void;
  }) {
  const { message, own, groupStart, groupEnd } = row;
  const [actionsShown, setActionsShown] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const touchPress = useRef(false);
  const parts = messageParts(message);
  const time = formatChatTime(message.created);
  const head = metaHead(message.agent, message.model, modelNames);
  const duration =
    message.durationMs !== null && message.durationMs > 0
      ? turnDurationLabel(message.durationMs)
      : null;
  const copyText = parts
    .filter((part): part is Extract<ChatPart, { kind: "text" }> => part.kind === "text")
    .map((part) => part.text)
    .join("\n\n");

  function cancelLongPress(): void {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.pointerType !== "touch") return;
    touchPress.current = true;
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      setActionsShown(true);
    }, LONG_PRESS_MS);
  }

  function handlePointerEnd(): void {
    touchPress.current = false;
    cancelLongPress();
  }

  // A long-press must not open the browser's context menu instead.
  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    if (touchPress.current || actionsShown) event.preventDefault();
  }

  const tailClass = groupEnd ? (own ? " oc-tail-own" : " oc-tail-other") : "";
  const body = own ? (
    <div className={`chat-bubble chat-bubble-primary break-words${tailClass}`}>
      {parts.map((part, partIndex) => (
        <PartView
          key={partIndex}
          messageID={message.messageID}
          part={part}
          partIndex={partIndex}
        />
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-1 items-start min-w-0 max-w-full">
      {renderRows(parts).map((rowItem) =>
        rowItem.kind === "group" ? (
          <ContextToolGroup
            key={`group-${rowItem.partIndex}`}
            messageID={message.messageID}
            partIndex={rowItem.partIndex}
            parts={rowItem.parts}
          />
        ) : rowItem.part.kind === "text" ? (
          <TextBody
            key={rowItem.partIndex}
            messageID={message.messageID}
            partIndex={rowItem.partIndex}
            part={rowItem.part}
            className={`chat-bubble chat-bubble-neutral break-words${tailClass}`}
          />
        ) : (
          <PartView
            key={rowItem.partIndex}
            messageID={message.messageID}
            part={rowItem.part}
            partIndex={rowItem.partIndex}
          />
        ),
      )}
    </div>
  );

  return (
    <li
      data-testid="message-item"
      data-role={message.role}
      data-group-start={groupStart ? "true" : "false"}
      className={own ? "chat chat-end" : "chat chat-start"}
    >
      <div
        className="group/msg relative max-w-[85%] min-w-0"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onContextMenu={handleContextMenu}
      >
        {groupStart && (
          <div className="chat-header oc-micro opacity-60 mb-1 flex flex-wrap items-center gap-x-1">
            <span>{own ? <Trans>Du</Trans> : <Trans>Assistent</Trans>}</span>
            {head !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate" data-testid={`message-meta-${message.messageID}`}>
                  {head}
                </span>
              </>
            )}
            {duration !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="oc-tabular">{duration}</span>
              </>
            )}
            {time !== "" && (
              <>
                <span aria-hidden="true">·</span>
                <time
                  dateTime={new Date(message.created).toISOString()}
                  className="oc-tabular"
                  data-testid={`message-time-${message.messageID}`}
                >
                  {time}
                </time>
              </>
            )}
          </div>
        )}
        {body}
        <MessageActions
          messageID={message.messageID}
          copyText={copyText}
          revertable={!own && onRevert !== undefined}
          onRevert={onRevert}
          shown={actionsShown}
        />
      </div>
    </li>
  );
  },
  (prev, next) =>
    // Identity of the message plus the group flags the row carries. A streaming
    // frame swaps exactly one message object; everything else compares equal
    // and stays mounted.
    prev.row.message === next.row.message &&
    prev.row.own === next.row.own &&
    prev.row.groupStart === next.row.groupStart &&
    prev.row.groupEnd === next.row.groupEnd &&
    prev.modelNames === next.modelNames &&
    prev.onRevert === next.onRevert,
);

/** Bare centered status line for notes (idle, compaction, switches, …). */
const NoteRow = memo(function NoteRow({ message }: { message: CachedMessage }) {
  const parts = messageParts(message);
  // Known status notes (idle, contentless compaction, …) render as a bare
  // centered status line: stray `unknown` parts (e.g. from legacy cache rows)
  // are dropped. Only truly foreign types (`unknown` kind) keep the "unknown
  // content" fallback.
  const noteParts =
    message.noteKind !== null && message.noteKind !== "unknown"
      ? parts.filter((part) => part.kind !== "unknown")
      : parts;
  const time = formatChatTime(message.created);
  return (
    <li data-testid="message-item" data-role="note">
      <div
        className="text-center text-xs opacity-70 mx-auto max-w-prose"
        data-testid={`message-note-${message.messageID}`}
      >
        <p>
          <strong>
            <NoteHeadline kind={message.noteKind ?? "unknown"} detail={message.noteDetail} />
          </strong>
        </p>
        {noteParts.map((part, partIndex) =>
          part.kind === "text" ? (
            <div key={partIndex} className="whitespace-pre-wrap break-words mt-1 text-left">
              <Markdown text={part.text} />
            </div>
          ) : (
            <PartView
              key={partIndex}
              messageID={message.messageID}
              part={part}
              partIndex={partIndex}
            />
          ),
        )}
        {time !== "" && (
          <p className="mt-1 text-[11px] opacity-60">
            <time dateTime={new Date(message.created).toISOString()} className="oc-tabular">{time}</time>
          </p>
        )}
      </div>
    </li>
  );
});

export default function ChatMessageList({
  messages,
  modelNames = {},
  onRevertToMessage,
}: {
  messages: CachedMessage[];
  /** `provider/model` → display name, so the chrome shows the model's name. */
  modelNames?: Readonly<Record<string, string>>;
  /** Quick action "revert to this message" (stages a revert from here). */
  onRevertToMessage?: (messageID: string) => void;
}) {
  const rows = groupChatMessages(messages);
  return (
    <ul className="oc-dense oc-chat flex flex-col gap-2" data-testid="message-list">
      {rows.map((row, index) => {
        if (row.kind === "day") {
          return <DaySeparator key={`day-${row.key}-${index}`} label={row.label} date={row.date} />;
        }
        if (row.kind === "note") {
          return <NoteRow key={row.message.messageID} message={row.message} />;
        }
        return (
          <MessageBubble
            key={row.message.messageID}
            row={row}
            modelNames={modelNames}
            onRevert={onRevertToMessage}
          />
        );
      })}
    </ul>
  );
}
