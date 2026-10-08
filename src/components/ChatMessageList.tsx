import { Trans } from "@lingui/react/macro";
import Icon from "./Icon.tsx";
import Markdown from "./Markdown.tsx";
import { formatChatTime, type ChatNoteKind, type ChatPart } from "../lib/sessionMessages.ts";
import type { CachedMessage } from "../lib/messageCache.ts";

/**
 * Chat-first conversation view for SessionDetail. User messages render right
 * (primary bubble), assistant messages left (neutral bubble); system, idle,
 * compaction and every other status render as subtle centered notes — never
 * as bubbles and never as raw JSON. Unknown future part types degrade to a
 * small "unbekannter Inhalt" note.
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
  return (
    <span className="badge badge-ghost badge-sm">
      <Trans>Werkzeug</Trans>
    </span>
  );
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
    return (
      <details
        className="card bg-base-300/60 rounded p-2 mt-1"
        data-testid={`message-tool-${messageID}-${partIndex}`}
      >
        <summary className="cursor-pointer text-sm flex items-center gap-2">
          <Icon name="tool" />
          <span className="font-mono flex-1 break-all">{part.name}</span>
          <ToolStatusBadge status={part.status} />
        </summary>
        {part.detail !== null && (
          <pre className="text-xs whitespace-pre-wrap break-words mt-1 max-h-48 overflow-auto">
            {part.detail}
          </pre>
        )}
      </details>
    );
  }
  if (part.kind === "files") {
    return (
      <ul
        className="flex flex-col gap-1 mt-1 text-sm"
        data-testid={`message-files-${messageID}-${partIndex}`}
      >
        {part.files.map((file) => (
          <li key={file} className="flex items-center gap-1 opacity-80">
            <Icon name="file" />
            <span className="font-mono break-all">{file}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-xs opacity-70" data-testid={`message-unknown-${messageID}-${partIndex}`}>
      <Trans>Unbekannter Inhalt – wird in einer künftigen Version angezeigt.</Trans>
    </p>
  );
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
                {parts.map((part, partIndex) =>
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
                  <p className="mt-1">
                    <time dateTime={new Date(message.created).toISOString()}>{time}</time>
                  </p>
                )}
              </div>
            </li>
          );
        }
        const own = message.role === "user";
        return (
          <li
            key={message.messageID}
            data-testid="message-item"
            data-role={message.role}
            className={own ? "chat chat-end" : "chat chat-start"}
          >
            <div className="chat-header text-xs opacity-70 mb-1">
              {own ? <Trans>Du</Trans> : <Trans>Assistent</Trans>}
              {time !== "" && (
                <>
                  {" · "}
                  <time dateTime={new Date(message.created).toISOString()}>{time}</time>
                </>
              )}
            </div>
            <div
              className={
                own
                  ? "chat-bubble chat-bubble-primary break-words"
                  : "chat-bubble chat-bubble-neutral break-words"
              }
            >
              {parts.map((part, partIndex) => (
                <PartView
                  key={partIndex}
                  messageID={message.messageID}
                  part={part}
                  partIndex={partIndex}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
