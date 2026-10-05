import { t } from "@lingui/core/macro";
import { useEffect } from "react";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import { extractMessageFromEvent } from "../lib/eventMessages.ts";
import { putMessages } from "../lib/messageCache.ts";
import { notifySessionEvent } from "../lib/notify.ts";
import type { ServerConfig } from "../lib/opencode.ts";

export interface EventSummary {
  title: string;
  body: string;
  important: boolean;
}

function readType(event: unknown): string | null {
  if (event === null || typeof event !== "object") return null;
  const value: unknown = (event as Record<string, unknown>)["type"];
  return typeof value === "string" ? value : null;
}

function readSessionId(event: unknown): string {
  if (event === null || typeof event !== "object") return "";
  const data: unknown = (event as Record<string, unknown>)["data"];
  if (data !== null && typeof data === "object") {
    const id: unknown = (data as Record<string, unknown>)["sessionID"];
    if (typeof id === "string") return id.slice(0, 8);
  }
  const direct: unknown = (event as Record<string, unknown>)["sessionID"];
  return typeof direct === "string" ? direct.slice(0, 8) : "";
}

/**
 * Map a raw V2 event to a local notification. Returns null for noisy or
 * uninteresting events (streaming deltas, heartbeats, unknown shapes).
 * German titles, since UI strings are German.
 */
export function describeEvent(event: unknown): EventSummary | null {
  const type = readType(event);
  if (type === null) return null;
  const session = readSessionId(event);
  const suffix = session === "" ? "" : ` (${session})`;

  if (type === "permission.asked") {
    return { title: t`Freigabe erforderlich`, body: t`Eine Aktion wartet auf Freigabe${suffix}.`, important: true };
  }
  if (type === "permission.replied") {
    return { title: t`Freigabe beantwortet`, body: t`Die Freigabe wurde beantwortet${suffix}.`, important: false };
  }
  if (type === "session.created") {
    return { title: t`Neue Session`, body: t`Session erstellt${suffix}.`, important: false };
  }
  if (type === "session.deleted") {
    return { title: t`Session gelöscht`, body: t`Session entfernt${suffix}.`, important: false };
  }
  if (type === "session.idle") {
    return { title: t`Session bereit`, body: t`Session ist bereit${suffix}.`, important: false };
  }
  if (type === "session.status" || type === "session.status.updated") {
    return { title: t`Session-Status`, body: t`Status geändert${suffix}.`, important: false };
  }
  if (type === "session.execution.succeeded") {
    return { title: t`Ausführung fertig`, body: t`Die Ausführung war erfolgreich${suffix}.`, important: false };
  }
  if (type === "session.execution.failed" || type === "session.step.failed" || type === "session.tool.failed") {
    return { title: t`Ausführung fehlgeschlagen`, body: t`${type}${suffix}.`, important: true };
  }
  if (type === "session.execution.interrupted") {
    return { title: t`Ausführung unterbrochen`, body: t`Die Ausführung wurde unterbrochen${suffix}.`, important: false };
  }
  if (type === "session.compaction.started") {
    return { title: t`Kompaktierung läuft`, body: t`Session wird kompaktiert${suffix}.`, important: false };
  }
  if (type === "session.compaction.ended") {
    return { title: t`Kompaktierung fertig`, body: t`Session kompaktiert${suffix}.`, important: false };
  }
  if (type === "session.compaction.failed") {
    return { title: t`Kompaktierung fehlgeschlagen`, body: t`Kompaktierung gescheitert${suffix}.`, important: true };
  }
  if (type === "session.inbox.enqueued" || type === "session.inbox.delivered") {
    return { title: t`Neue Inbox-Nachricht`, body: t`Eingang für Session${suffix}.`, important: false };
  }
  if (type === "session.shell.started" || type === "session.shell.ended") {
    return { title: t`Shell-Ereignis`, body: t`${type}${suffix}.`, important: false };
  }
  return null;
}

/**
 * Listen on the selected server's shared event stream: raise local
 * notifications for session/compaction/permission events and cache incoming
 * session messages in the background. The shared hub keeps exactly one
 * stream per server (backoff reconnect, AbortController cleanup when the
 * last listener leaves or the server changes).
 */
export function useEventNotifications(server: ServerConfig | null): void {
  useEffect(() => {
    if (server === null) return;
    const activeServer: ServerConfig = server;
    return subscribeServerEvents(activeServer, (event: unknown) => {
      const message = extractMessageFromEvent(event);
      if (message !== null) {
        void putMessages(activeServer.id, message.sessionID, [
          { id: message.messageID, role: message.role, text: message.text, created: message.created },
        ]);
      }
      const summary = describeEvent(event);
      if (summary !== null) {
        notifySessionEvent(summary.title, summary.body, summary.important);
      }
    });
  }, [server]);
}
