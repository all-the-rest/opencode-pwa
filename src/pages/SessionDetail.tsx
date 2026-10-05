import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SESSION_PAGE_SIZE, useSessionMessages, type SessionMessageSource } from "../hooks/useSessionMessages.ts";
import { useServers } from "../state/servers.tsx";

function countLabel(total: number, source: SessionMessageSource): string {
  const base = total === 1 ? "1 Nachricht" : `${total} Nachrichten`;
  if (source === "live") return `${base} (live)`;
  if (source === "cache") return `${base} (aus Zwischenspeicher)`;
  return `${base} (offline aus Zwischenspeicher)`;
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { servers, selectedServer } = useServers();
  const serverId = searchParams.get("server") ?? selectedServer?.id ?? null;
  const server = servers.find((s) => s.id === serverId) ?? selectedServer;

  const {
    visible,
    total,
    hasMore,
    loadMore,
    loading,
    refreshing,
    error,
    source,
    liveCount,
  } = useSessionMessages(server, id, SESSION_PAGE_SIZE);
  const [draft, setDraft] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (node === null || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first !== undefined && first.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  const showInitialSpinner = loading && total === 0;
  const showEmpty = !loading && error === null && total === 0;
  const showList = !showInitialSpinner && (total > 0 || error !== null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Session</h1>
      <p className="text-sm opacity-70 font-mono break-all">{id}</p>
      {server === null || server === undefined ? (
        <div className="alert alert-info">
          <span>Kein Server ausgewählt. Wähle oben einen Server.</span>
        </div>
      ) : (
        <>
          <p className="text-sm opacity-70">Server: {server.name}</p>
          <p className="text-sm opacity-70" data-testid="cache-status">
            {loading && total === 0 ? (
              "Nachrichten werden geladen …"
            ) : (
              <>
                {countLabel(total, source)}
                {refreshing && total > 0 ? " – Aktualisiere …" : ""}
                {liveCount > 0 ? ` · ${liveCount} neue` : ""}
              </>
            )}
          </p>
          {showInitialSpinner && <span className="loading loading-spinner loading-md" aria-label="Lädt" />}
          {error !== null && total === 0 && !loading && (
            <div className="alert alert-warning">
              <span>Nachrichten konnten nicht geladen werden (offline?): {error}</span>
            </div>
          )}
          {error !== null && total > 0 && (
            <div className="alert alert-warning">
              <span>Offline: zwischengespeicherte Nachrichten werden angezeigt ({error}).</span>
            </div>
          )}
          {showEmpty && <p className="opacity-70 text-sm">Keine Nachrichten vorhanden.</p>}
          {showList && total > 0 && (
            <ul className="flex flex-col gap-2" data-testid="message-list">
              {visible.map((m) => (
                <li
                  key={m.messageID}
                  data-testid="message-item"
                  className={m.role === "user" ? "chat chat-end" : "chat chat-start"}
                >
                  <div className="chat-header text-xs opacity-70 mb-1">{m.role}</div>
                  <div
                    className={
                      m.role === "user"
                        ? "chat-bubble chat-bubble-primary whitespace-pre-wrap break-words"
                        : "chat-bubble chat-bubble-neutral whitespace-pre-wrap break-words"
                    }
                  >
                    {m.text}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div ref={sentinelRef} data-testid="load-more-sentinel" aria-hidden="true" />
          {hasMore && (
            <button
              type="button"
              className="btn btn-ghost btn-sm self-center"
              onClick={loadMore}
              aria-label="Ältere Nachrichten laden"
            >
              Ältere Nachrichten laden ({total - visible.length} weitere)
            </button>
          )}
          <form
            className="flex gap-2 sticky bottom-4"
            onSubmit={(e) => {
              e.preventDefault();
              // Read-only MVP: sending is deferred (see AGENTS.todo.md).
              setDraft("");
            }}
          >
            <input
              className="input input-bordered flex-1"
              placeholder="Nachricht schreiben (MVP: nur lesen)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Nachricht schreiben"
              disabled
            />
            <button className="btn btn-primary" type="submit" disabled title="Senden folgt nach MVP">
              Senden
            </button>
          </form>
          <p className="text-xs opacity-60">MVP ist lesend: Senden ist deaktiviert.</p>
        </>
      )}
    </div>
  );
}
