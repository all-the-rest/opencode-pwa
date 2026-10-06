import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import Icon from "../components/Icon.tsx";
import { SESSION_PAGE_SIZE, useSessionMessages, type SessionMessageSource } from "../hooks/useSessionMessages.ts";
import {
  compactSession,
  forkSession,
  getSessionDiff,
  getSessionInfo,
  getSessionStats,
  interruptSession,
  listAgents,
  listModels,
  modelOptionValue,
  parseModelOptionValue,
  removeSession,
  sendPrompt,
  switchSessionAgent,
  switchSessionModel,
  toPromptFileUri,
  type AgentOption,
  type ModelOption,
  type PromptFileAttachment,
  type ServerConfig,
  type SessionDiffRow,
  type SessionStatsSummary,
  type TokenUsage,
} from "../lib/opencode.ts";
import { isActionEnabled, reachability } from "../lib/offline.ts";
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
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachmentInput, setAttachmentInput] = useState("");
  const [confirm, setConfirm] = useState<"interrupt" | "delete" | "fork" | "compact" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<TokenUsage | null>(null);
  const [sessionCost, setSessionCost] = useState<number | null>(null);
  const [globalStats, setGlobalStats] = useState<SessionStatsSummary | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffRows, setDiffRows] = useState<SessionDiffRow[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [currentModelValue, setCurrentModelValue] = useState<string>("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

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

  useEffect(() => {
    if (server === null || server === undefined || id === undefined) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    let cancelled = false;
    setPickerError(null);
    void Promise.all([
      listAgents(activeServer),
      listModels(activeServer),
      getSessionInfo(activeServer, activeSession),
      getSessionStats(activeServer),
    ]).then(([agentsRes, modelsRes, infoRes, statsRes]) => {
      if (cancelled) return;
      const firstError = agentsRes.error ?? modelsRes.error ?? infoRes.error;
      if (firstError !== null) {
        setPickerError(firstError);
        return;
      }
      setAgents(agentsRes.data ?? []);
      setModels(modelsRes.data ?? []);
      const info = infoRes.data;
      setCurrentAgent(info?.agent ?? null);
      setSessionTokens(info?.tokens ?? null);
      setSessionCost(info?.cost ?? null);
      setCurrentModelValue(
        info?.model === null || info?.model === undefined
          ? ""
          : modelOptionValue({
              id: info.model.id,
              providerID: info.model.providerID,
              ...(info.model.variant !== undefined ? { variant: info.model.variant } : {}),
            }),
      );
      // The global stats call is best-effort: the per-session card above must
      // not fail just because the aggregate endpoint is unreachable.
      if (statsRes.error === null) setGlobalStats(statsRes.data);
    });
    return () => {
      cancelled = true;
    };
  }, [server, id]);

  const showInitialSpinner = loading && total === 0;
  const showEmpty = !loading && error === null && total === 0;
  const showList = !showInitialSpinner && (total > 0 || error !== null);
  const serverName = server?.name ?? "";
  const remaining = total - visible.length;
  const { offline } = reachability(error);
  const canFork = isActionEnabled(offline, "session-fork");
  const canCompact = isActionEnabled(offline, "session-compact");
  const canDiff = isActionEnabled(offline, "session-diff");
  // Lingui messages take plain variables only — no member access or calls —
  // so every formatted stat is hoisted here (see `lingui/no-expression-in-message`).
  const statInput = (sessionTokens?.input ?? 0).toLocaleString("de");
  const statOutput = (sessionTokens?.output ?? 0).toLocaleString("de");
  const statReasoning = (sessionTokens?.reasoning ?? 0).toLocaleString("de");
  const statCacheRead = (sessionTokens?.cacheRead ?? 0).toLocaleString("de");
  const statCacheWrite = (sessionTokens?.cacheWrite ?? 0).toLocaleString("de");
  const statCost = (sessionCost ?? 0).toLocaleString("de", {
    style: "currency",
    currency: "USD",
  });
  const totalPrompts = globalStats?.prompts ?? 0;
  const totalSteps = globalStats?.steps ?? 0;
  const totalToolCalls = globalStats?.toolCalls ?? null;

  function addAttachment() {
    const path = attachmentInput.trim().replace(/^\/+/, "");
    if (path === "" || attachments.includes(path)) return;
    setAttachments((prev) => [...prev, path]);
    setAttachmentInput("");
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((entry) => entry !== path));
  }

  function toAttachmentFiles(paths: string[]): PromptFileAttachment[] {
    return paths.map((path) => ({
      uri: toPromptFileUri(path),
      name: path.split("/").pop() ?? path,
    }));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (server === null || server === undefined || id === undefined) return;
    if (text === "" || sending) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    const files = toAttachmentFiles(attachments);
    setDraft("");
    setAttachments([]);
    setAttachmentInput("");
    setSendError(null);
    const localID = addLocalMessage("user", text);
    setSending(true);
    const result = await sendPrompt(activeServer, activeSession, text, files);
    setSending(false);
    // The server echo carries its own message id, so the optimistic entry
    // is dropped and replaced by the live/network message shortly after.
    dropLocalMessage(localID);
    if (result.error !== null) {
      setSendError(result.error);
      setDraft(text);
      setAttachments(attachments);
    }
  }

  async function handleAgentChange(value: string) {
    if (server === null || server === undefined || id === undefined || value === "" || switching) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setSwitching(true);
    setPickerError(null);
    const result = await switchSessionAgent(activeServer, activeSession, value);
    setSwitching(false);
    if (result.error !== null) {
      setPickerError(result.error);
      return;
    }
    setCurrentAgent(value);
  }

  async function handleModelChange(value: string) {
    if (server === null || server === undefined || id === undefined || value === "" || switching) return;
    const model = parseModelOptionValue(value);
    if (model === null) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setSwitching(true);
    setPickerError(null);
    const result = await switchSessionModel(activeServer, activeSession, model);
    setSwitching(false);
    if (result.error !== null) {
      setPickerError(result.error);
      return;
    }
    setCurrentModelValue(value);
  }

  async function handleConfirm() {
    if (server === null || server === undefined || id === undefined || confirm === null) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setConfirmBusy(true);
    setConfirmError(null);
    setActionNotice(null);
    if (confirm === "fork") {
      const result = await forkSession(activeServer, activeSession);
      setConfirmBusy(false);
      if (result.error !== null || result.data === null) {
        setConfirmError(result.error ?? t`Forken fehlgeschlagen.`);
        return;
      }
      setConfirm(null);
      navigate(`/sessions/${result.data.id}?server=${activeServer.id}`);
      return;
    }
    if (confirm === "compact") {
      const result = await compactSession(activeServer, activeSession);
      setConfirmBusy(false);
      if (result.error !== null) {
        setConfirmError(result.error);
        return;
      }
      setConfirm(null);
      setActionNotice(t`Kompaktierung gestartet – der Kontext wird zusammengefasst.`);
      return;
    }
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

  async function toggleDiff() {
    if (diffOpen) {
      setDiffOpen(false);
      return;
    }
    setDiffOpen(true);
    if (diffRows !== null || diffLoading) return;
    if (server === null || server === undefined || id === undefined) return;
    setDiffLoading(true);
    setDiffError(null);
    const result = await getSessionDiff(server, id);
    setDiffLoading(false);
    if (result.error !== null || result.data === null) {
      setDiffError(result.error ?? t`Diffs konnten nicht geladen werden.`);
      return;
    }
    setDiffRows(result.data);
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
              title={t`Session ab dem aktuellen Stand kopieren`}
              aria-label={t`Session forken`}
              disabled={!canFork}
              onClick={() => {
                setConfirmError(null);
                setConfirm("fork");
              }}
            >
              <Icon name="fork" /> <Trans>Forken</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title={t`Kontext der Session zusammenfassen`}
              aria-label={t`Session kompaktieren`}
              disabled={!canCompact}
              onClick={() => {
                setConfirmError(null);
                setConfirm("compact");
              }}
            >
              <Icon name="compact" /> <Trans>Kompaktieren</Trans>
            </button>
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
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Agent</Trans>
              </span>
              <select
                className="select select-bordered select-sm"
                value={currentAgent ?? ""}
                onChange={(e) => void handleAgentChange(e.target.value)}
                disabled={switching || agents.length === 0}
                aria-label={t`Agent der Session`}
                data-testid="session-agent-select"
              >
                <option value="">
                  <Trans>Keiner</Trans>
                </option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Modell</Trans>
              </span>
              <select
                className="select select-bordered select-sm"
                value={currentModelValue}
                onChange={(e) => void handleModelChange(e.target.value)}
                disabled={switching || models.length === 0}
                aria-label={t`Modell der Session`}
                data-testid="session-model-select"
              >
                <option value="">
                  <Trans>Keines</Trans>
                </option>
                {models.map((m) => {
                  const optionValue = modelOptionValue(m);
                  return (
                    <option key={optionValue} value={optionValue}>
                      {m.name}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          {pickerError !== null && (
            <div className="alert alert-error">
              <span>
                <Trans>Agent/Modell konnte nicht gewechselt werden: {pickerError}</Trans>
              </span>
            </div>
          )}
          {actionNotice !== null && (
            <div className="alert alert-success">
              <span>{actionNotice}</span>
            </div>
          )}
          <section className="card bg-base-200 shadow" data-testid="session-stats">
            <div className="card-body py-3">
              <h2 className="card-title text-base">
                <Trans>Verbrauch dieser Session</Trans>
              </h2>
              {sessionTokens === null && sessionCost === null ? (
                <p className="opacity-70 text-sm">
                  <Trans>Noch keine Verbrauchsdaten vorhanden.</Trans>
                </p>
              ) : (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Eingabe:</Trans>
                    </dt>
                    <dd className="font-mono" data-testid="session-stats-input">
                      {statInput}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Ausgabe:</Trans>
                    </dt>
                    <dd className="font-mono" data-testid="session-stats-output">
                      {statOutput}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Denken:</Trans>
                    </dt>
                    <dd className="font-mono">{statReasoning}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Cache (lesen/schreiben):</Trans>
                    </dt>
                    <dd className="font-mono">
                      {statCacheRead}/{statCacheWrite}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Kosten:</Trans>
                    </dt>
                    <dd className="font-mono" data-testid="session-stats-cost">
                      {statCost}
                    </dd>
                  </div>
                </dl>
              )}
              {globalStats !== null && (
                <p className="text-xs opacity-70">
                  {totalToolCalls === null ? (
                    <Trans>
                      Gesamt (alle Sessions): {totalPrompts} Prompts, {totalSteps} Schritte
                    </Trans>
                  ) : (
                    <Trans>
                      Gesamt (alle Sessions): {totalPrompts} Prompts, {totalSteps} Schritte,{" "}
                      {totalToolCalls} Werkzeugaufrufe
                    </Trans>
                  )}
                </p>
              )}
            </div>
          </section>
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
          <section className="card bg-base-200 shadow" data-testid="session-diff-section">
            <div className="card-body py-3">
              <div className="flex items-center gap-2">
                <h2 className="card-title text-base flex-1">
                  <Trans>Dateiänderungen</Trans>
                </h2>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={!canDiff}
                  aria-expanded={diffOpen}
                  aria-label={diffOpen ? t`Diffs ausblenden` : t`Diffs anzeigen`}
                  onClick={() => void toggleDiff()}
                >
                  {diffOpen ? <Trans>Ausblenden</Trans> : <Trans>Diffs anzeigen</Trans>}
                </button>
              </div>
              {diffOpen && (
                <>
                  {diffLoading && (
                    <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />
                  )}
                  {diffError !== null && (
                    <div className="alert alert-warning">
                      <span>
                        <Trans>Diffs konnten nicht geladen werden: {diffError}</Trans>
                      </span>
                    </div>
                  )}
                  {!diffLoading && diffError === null && diffRows !== null && diffRows.length === 0 && (
                    <p className="opacity-70 text-sm">
                      <Trans>Keine Dateiänderungen in dieser Session.</Trans>
                    </p>
                  )}
                  {!diffLoading && diffError === null && diffRows !== null && diffRows.length > 0 && (
                    <ul className="flex flex-col gap-2" data-testid="session-diff">
                      {diffRows.map((row) => (
                        <li key={row.file} data-testid={`session-diff-${row.file}`}>
                          <details className="collapse collapse-arrow bg-base-300 rounded">
                            <summary className="collapse-title text-sm font-mono flex items-center gap-2">
                              <span className="flex-1 break-all">{row.file}</span>
                              <span className="text-xs opacity-70">
                                {`+${row.additions} −${row.deletions}`}
                              </span>
                            </summary>
                            <div className="collapse-content">
                              <pre className="text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto">
                                {row.patch === "" ? t`Kein Patch verfügbar.` : row.patch}
                              </pre>
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </section>
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1" data-testid="prompt-attachments" aria-label={t`Angehängte Dateien`}>
              {attachments.map((path) => (
                <li
                  key={path}
                  data-testid={`prompt-attachment-${path}`}
                  className="badge badge-primary gap-1 py-3"
                >
                  <Icon name="file" />
                  <span className="font-mono max-w-48 truncate" title={path}>
                    {path}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    aria-label={t`Anhang ${path} entfernen`}
                    onClick={() => removeAttachment(path)}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addAttachment();
            }}
          >
            <input
              className="input input-bordered input-sm flex-1 font-mono"
              placeholder={t`Dateipfad anhängen, z. B. src/app.ts`}
              value={attachmentInput}
              onChange={(e) => setAttachmentInput(e.target.value)}
              aria-label={t`Datei an den Prompt anhängen`}
              disabled={sending}
              data-testid="prompt-attachment-input"
            />
            <button
              type="submit"
              className="btn btn-sm btn-ghost"
              disabled={sending || attachmentInput.trim() === ""}
              aria-label={t`Datei anhängen`}
            >
              <Icon name="plus" /> <Trans>Anhängen</Trans>
            </button>
          </form>
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
        title={
          confirm === "delete"
            ? t`Session löschen`
            : confirm === "fork"
              ? t`Session forken`
              : confirm === "compact"
                ? t`Session kompaktieren`
                : t`Ausführung unterbrechen`
        }
        message={
          confirm === "delete"
            ? t`Die Session wird endgültig gelöscht. Fortfahren?`
            : confirm === "fork"
              ? t`Die Session wird ab dem aktuellen Stand kopiert. Die neue Session öffnet sich danach automatisch. Fortfahren?`
              : confirm === "compact"
                ? t`Der Kontext wird zusammengefasst, um Platz zu schaffen. Fortfahren?`
                : t`Die laufende Ausführung wird unterbrochen. Die Session selbst bleibt erhalten. Fortfahren?`
        }
        confirmLabel={
          confirm === "delete"
            ? t`Löschen`
            : confirm === "fork"
              ? t`Forken`
              : confirm === "compact"
                ? t`Kompaktieren`
                : t`Unterbrechen`
        }
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
