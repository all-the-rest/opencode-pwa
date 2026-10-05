import { useEffect } from "react";
import { notifySessionEvent } from "../lib/notify.ts";
import { subscribeEvents, type ServerConfig } from "../lib/opencode.ts";

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
    return { title: "Freigabe erforderlich", body: `Eine Aktion wartet auf Freigabe${suffix}.`, important: true };
  }
  if (type === "permission.replied") {
    return { title: "Freigabe beantwortet", body: `Die Freigabe wurde beantwortet${suffix}.`, important: false };
  }
  if (type === "session.created") {
    return { title: "Neue Session", body: `Session erstellt${suffix}.`, important: false };
  }
  if (type === "session.deleted") {
    return { title: "Session gelöscht", body: `Session entfernt${suffix}.`, important: false };
  }
  if (type === "session.idle") {
    return { title: "Session bereit", body: `Session ist bereit${suffix}.`, important: false };
  }
  if (type === "session.status" || type === "session.status.updated") {
    return { title: "Session-Status", body: `Status geändert${suffix}.`, important: false };
  }
  if (type === "session.execution.succeeded") {
    return { title: "Ausführung fertig", body: `Die Ausführung war erfolgreich${suffix}.`, important: false };
  }
  if (type === "session.execution.failed" || type === "session.step.failed" || type === "session.tool.failed") {
    return { title: "Ausführung fehlgeschlagen", body: `${type}${suffix}.`, important: true };
  }
  if (type === "session.execution.interrupted") {
    return { title: "Ausführung unterbrochen", body: `Die Ausführung wurde unterbrochen${suffix}.`, important: false };
  }
  if (type === "session.compaction.started") {
    return { title: "Kompaktierung läuft", body: `Session wird kompaktiert${suffix}.`, important: false };
  }
  if (type === "session.compaction.ended") {
    return { title: "Kompaktierung fertig", body: `Session kompaktiert${suffix}.`, important: false };
  }
  if (type === "session.compaction.failed") {
    return { title: "Kompaktierung fehlgeschlagen", body: `Kompaktierung gescheitert${suffix}.`, important: true };
  }
  if (type === "session.inbox.enqueued" || type === "session.inbox.delivered") {
    return { title: "Neue Inbox-Nachricht", body: `Eingang für Session${suffix}.`, important: false };
  }
  if (type === "session.shell.started" || type === "session.shell.ended") {
    return { title: "Shell-Ereignis", body: `${type}${suffix}.`, important: false };
  }
  return null;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Subscribe to the selected server's event stream and raise local
 * notifications for session/compaction/permission events.
 * One stream per server; AbortController cleanup on server change/unmount;
 * reconnect with capped backoff while mounted.
 */
export function useEventNotifications(server: ServerConfig | null): void {
  useEffect(() => {
    if (server === null) return;
    const activeServer: ServerConfig = server;
    const controller = new AbortController();
    const signal = controller.signal;
    let backoff = 1000;

    async function pump(): Promise<void> {
      while (!signal.aborted) {
        try {
          for await (const event of subscribeEvents(activeServer, signal)) {
            if (signal.aborted) return;
            backoff = 1000;
            const summary = describeEvent(event);
            if (summary !== null) {
              notifySessionEvent(summary.title, summary.body, summary.important);
            }
          }
          return;
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          try {
            await delay(backoff, signal);
          } catch {
            return;
          }
          backoff = Math.min(backoff * 2, 30000);
        }
      }
    }

    void pump();
    return () => {
      controller.abort();
    };
  }, [server]);
}
