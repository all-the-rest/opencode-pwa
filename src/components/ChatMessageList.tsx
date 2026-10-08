import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import CopyButton from "./CopyButton.tsx";
import Icon from "./Icon.tsx";
import Markdown from "./Markdown.tsx";
import {
  formatChatTime,
  type ChatNoteKind,
  type ChatPart,
  type ChatToolPart,
} from "../lib/sessionMessages.ts";
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
 * Tool parts render as original-quality tool cards (icon + German label +
 * subtitle, argument chips, status, error variant, +/- change badges, title
 * shimmer while running); consecutive read/glob/grep/list calls collapse into
 * one expanded context summary row and hidden tools (`todowrite`) never show.
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
      <div className="whitespace-pre-wrap break-words">
        <Markdown text={part.text} />
      </div>
    );
  }
  if (part.kind === "reasoning") {
    return (
      <details className="opacity-80 text-sm" data-testid={`message-reasoning-${messageID}-${partIndex}`}>
        <summary className="cursor-pointer">
          <Trans>Denken anzeigen</Trans>
        </summary>
        <div className="whitespace-pre-wrap break-words mt-1">
          <Markdown text={part.text} />
        </div>
      </details>
    );
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
function metaHead(agent: string | null, model: string | null): string | null {
  const items = [agent, model].filter((value): value is string => value !== null);
  return items.length === 0 ? null : items.join(" · ");
}

function isNote(message: CachedMessage): boolean {
  return message.role !== "user" && message.role !== "assistant";
}

export default function ChatMessageList({ messages }: { messages: CachedMessage[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="message-list">
      {messages.map((message) => {
        const time = formatChatTime(message.created);
        // Legacy cache rows carry no parts: fall back to the plain stored
        // text (already scrubbed of JSON dumps on read), else an unknown note.
        const storedParts = message.parts ?? [];
        const parts: ChatPart[] =
          storedParts.length > 0
            ? storedParts
            : message.text !== ""
              ? [{ kind: "text", text: message.text } as const]
              : [{ kind: "unknown" } as const];
        if (isNote(message)) {
          // Known status notes (idle, contentless compaction, …) render as a
          // bare centered status line: stray `unknown` parts (e.g. from legacy
          // cache rows) are dropped. Only truly foreign types (`unknown` kind)
          // keep the "unknown content" fallback.
          const noteParts =
            message.noteKind !== null && message.noteKind !== "unknown"
              ? parts.filter((part) => part.kind !== "unknown")
              : parts;
          return (
            <li key={message.messageID} data-testid="message-item" data-role="note">
              <div
                className="text-center text-xs opacity-70 mx-auto max-w-prose"
                data-testid={`message-note-${message.messageID}`}
              >
                <p>
                  <strong>
                    <NoteHeadline
                      kind={message.noteKind ?? "unknown"}
                      detail={message.noteDetail}
                    />
                  </strong>
                </p>
                {noteParts.map((part, partIndex) =>
                  part.kind === "text" ? (
                    <div
                      key={partIndex}
                      className="whitespace-pre-wrap break-words mt-1 text-left"
                    >
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
                    <time dateTime={new Date(message.created).toISOString()} className="tabular-nums">{time}</time>
                  </p>
                )}
              </div>
            </li>
          );
        }
        const own = message.role === "user";
        const copyText = parts
          .filter((part): part is Extract<ChatPart, { kind: "text" }> => part.kind === "text")
          .map((part) => part.text)
          .join("\n\n");
        const showCopy = !own && copyText !== "";
        const head = metaHead(message.agent, message.model);
        const duration =
          message.durationMs !== null && message.durationMs > 0
            ? turnDurationLabel(message.durationMs)
            : null;
        return (
          <li
            key={message.messageID}
            data-testid="message-item"
            data-role={message.role}
            className={own ? "chat chat-end" : "chat chat-start"}
          >
            <div className="chat-header text-[11px] opacity-60 mb-1">
              {own ? <Trans>Du</Trans> : <Trans>Assistent</Trans>}
              {head !== null && (
                <>
                  {" · "}
                  <span className="font-mono" data-testid={`message-meta-${message.messageID}`}>
                    {head}
                  </span>
                </>
              )}
              {duration !== null && (
                <>
                  {" · "}
                  <span className="tabular-nums">{duration}</span>
                </>
              )}
              {time !== "" && (
                <>
                  {" · "}
                  <time dateTime={new Date(message.created).toISOString()} className="tabular-nums">{time}</time>
                </>
              )}
            </div>
            <div
              className={
                own
                  ? "chat-bubble chat-bubble-primary break-words relative"
                  : `chat-bubble chat-bubble-neutral break-words relative${showCopy ? " pr-8" : ""}`
              }
            >
              {showCopy && (
                <CopyButton
                  text={copyText}
                  testid={`message-copy-${message.messageID}`}
                  className="absolute right-1 top-1 z-10"
                />
              )}
              {renderRows(parts).map((row) =>
                row.kind === "group" ? (
                  <ContextToolGroup
                    key={`group-${row.partIndex}`}
                    messageID={message.messageID}
                    partIndex={row.partIndex}
                    parts={row.parts}
                  />
                ) : (
                  <PartView
                    key={row.partIndex}
                    messageID={message.messageID}
                    part={row.part}
                    partIndex={row.partIndex}
                  />
                ),
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
