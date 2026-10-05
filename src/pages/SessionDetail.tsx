import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import Icon from "../components/Icon.tsx";
import { SESSION_PAGE_SIZE, useSessionMessages, type SessionMessageSource } from "../hooks/useSessionMessages.ts";
import { interruptSession, removeSession, sendPrompt, type ServerConfig } from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

function countLabel(total: number, source: SessionMessageSource): string {
  const base = total === 1 ? t`1 Nachricht` : t`${total} Nachrichten`;
  if (source === "live") return t`${base} (live)`;
  if (source === "cache") return t`${base} (aus Zwischenspeicher)`;
  return t`${base} (offline aus Zwischenspeicher)`;
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    addLocalMessage,
    dropLocalMessage,
  } = useSessionMessages(server, id, SESSION_PAGE_SIZE);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"interrupt" | "delete" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
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
  const serverName = server?.name ?? "";
  const remaining = total - visible.length;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (server === null || server === undefined || id === undefined) return;
    if (text === "" || sending) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setDraft("");
    setSendError(null);
    const localID = addLocalMessage("user", text);
    setSending(true);
    const result = await sendPrompt(activeServer, activeSession, text);
    setSending(false);
    // The server echo carries its own message id, so the optimistic entry
    // is dropped and replaced by the live/network message shortly after.
    dropLocalMessage(localID);
    if (result.error !== null) {
      setSendError(result.error);
      setDraft(text);
    }
  }

  async function handleConfirm() {
    if (server === null || server === undefined || id === undefined || confirm === null) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setConfirmBusy(true);
    setConfirmError(null);
    const result =
      confirm === "interrupt"
        ? await interruptSession(activeServer, activeSession)
        : await removeSession(activeServer, activeSession);
    setConfirmBusy(false);
    if (result.error !== null) {
      setConfirmError(result.error);
      return;
    }
    if (confirm === "delete") {
      setConfirm(null);
      navigate(`/servers/${activeServer.id}`);
      return;
    }
    setConfirm(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold flex-1">
          <Trans>Session</Trans>
        </h1>
        {server !== null && server !== undefined && id !== undefined && (
          <>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title={t`Laufende Ausführung unterbrechen`}
              aria-label={t`Ausführung unterbrechen`}
              onClick={() => {
                setConfirmError(null);
                setConfirm("interrupt");
              }}
            >
              <Icon name="stop" /> <Trans>Unterbrechen</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-error"
              title={t`Session löschen`}
              aria-label={t`Session löschen`}
              onClick={() => {
                setConfirmError(null);
                setConfirm("delete");
              }}
            >
              <Icon name="trash" /> <Trans>Löschen</Trans>
            </button>
          </>
        )}
      </div>
      <p className="text-sm opacity-70 font-mono break-all">{id}</p>
      {server === null || server === undefined ? (
        <div className="alert alert-info">
          <span>
            <Trans>Kein Server ausgewählt. Wähle oben einen Server.</Trans>
          </span>
        </div>
      ) : (
        <>
          <p className="text-sm opacity-70">
            <Trans>Server: {serverName}</Trans>
          </p>
          <p className="text-sm opacity-70" data-testid="cache-status">
            {loading && total === 0 ? (
              <Trans>Nachrichten werden geladen …</Trans>
            ) : (
              <>
                {countLabel(total, source)}
                {refreshing && total > 0 && (
                  <>
                    {" – "}
                    <Trans>Aktualisiere …</Trans>
                  </>
                )}
                {liveCount > 0 && (
                  <>
                    {" · "}
                    <Trans>{liveCount} neue</Trans>
                  </>
                )}
              </>
            )}
          </p>
          {showInitialSpinner && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
          {error !== null && total === 0 && !loading && (
            <div className="alert alert-warning">
              <span>
                <Trans>Nachrichten konnten nicht geladen werden (offline?): {error}</Trans>
              </span>
            </div>
          )}
          {error !== null && total > 0 && (
            <div className="alert alert-warning">
              <span>
                <Trans>Offline: zwischengespeicherte Nachrichten werden angezeigt ({error}).</Trans>
              </span>
            </div>
          )}
          {sendError !== null && (
            <div className="alert alert-error">
              <span>
                <Trans>Senden fehlgeschlagen: {sendError}</Trans>
              </span>
            </div>
          )}
          {showEmpty && (
            <p className="opacity-70 text-sm">
              <Trans>Keine Nachrichten vorhanden.</Trans>
            </p>
          )}
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
              aria-label={t`Ältere Nachrichten laden`}
            >
              <Trans>Ältere Nachrichten laden ({remaining} weitere)</Trans>
            </button>
          )}
          <form className="flex gap-2 sticky bottom-4" onSubmit={(e) => void handleSend(e)}>
            <input
              className="input input-bordered flex-1"
              placeholder={t`Nachricht schreiben`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={t`Nachricht schreiben`}
              disabled={sending}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={sending || draft.trim() === ""}
              aria-label={t`Nachricht senden`}
            >
              <Icon name="send" /> {sending ? <Trans>Sendet …</Trans> : <Trans>Senden</Trans>}
            </button>
          </form>
        </>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "delete" ? t`Session löschen` : t`Ausführung unterbrechen`}
        message={
          confirm === "delete"
            ? t`Die Session wird endgültig gelöscht. Fortfahren?`
            : t`Die laufende Ausführung wird unterbrochen. Die Session selbst bleibt erhalten. Fortfahren?`
        }
        confirmLabel={confirm === "delete" ? t`Löschen` : t`Unterbrechen`}
        busy={confirmBusy}
        error={confirmError}
        onConfirm={() => void handleConfirm()}
        onCancel={() => {
          if (!confirmBusy) {
            setConfirm(null);
            setConfirmError(null);
          }
        }}
      />
    </div>
  );
}
