import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import Icon from "./Icon.tsx";
import { isActionEnabled } from "../lib/offline.ts";
import {
  beginIntegrationOauth,
  connectIntegrationKey,
  getIntegration,
  getIntegrationOauthStatus,
  listIntegrations,
  parseFormAnswerText,
  type IntegrationOauthAttempt,
  type IntegrationOauthState,
  type IntegrationRow,
  type ServerConfig,
} from "../lib/opencode.ts";

const METHOD_LABELS: Record<string, string> = {
  oauth: "OAuth",
  key: "Schlüssel",
  command: "Befehl",
  env: "Umgebung",
  unbekannt: "Unbekannt",
};

const OAUTH_STATE_LABELS: Record<IntegrationOauthState["status"], string> = {
  pending: "wartet",
  complete: "abgeschlossen",
  failed: "fehlgeschlagen",
  expired: "abgelaufen",
};

function oauthBadgeClass(status: IntegrationOauthState["status"]): string {
  if (status === "complete") return "badge badge-success";
  if (status === "failed" || status === "expired") return "badge badge-error";
  return "badge badge-warning";
}

interface IntegrationsCardProps {
  server: ServerConfig;
  offline: boolean;
}

function connectionBadgeClass(needsAuth: boolean): string {
  return needsAuth ? "badge badge-error" : "badge badge-success";
}

/**
 * Read-only integration management with the two static-friendly connect
 * flows: key-based connect (writes the credential) and OAuth begin/status
 * (read-only — the provider redirect leaves the app, only the attempt state
 * is polled here). The `command` connect flow and `complete`/`cancel` stay
 * out on purpose (see `features/05-parity.md`).
 */
export default function IntegrationsCard({ server, offline }: IntegrationsCardProps) {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedID, setSelectedID] = useState("");
  const [detail, setDetail] = useState<IntegrationRow | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const [oauthAttempt, setOauthAttempt] = useState<IntegrationOauthAttempt | null>(null);
  const [oauthState, setOauthState] = useState<IntegrationOauthState | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const canList = isActionEnabled(offline, "integration-list");
  const canDetail = isActionEnabled(offline, "integration-detail");
  const canConnectKey = isActionEnabled(offline, "integration-connect-key");
  const canOauth = isActionEnabled(offline, "integration-oauth");

  useEffect(() => {
    if (!canList) return;
    let cancelled = false;
    setListError(null);
    setRows([]);
    setSelectedID("");
    setDetail(null);
    void listIntegrations(server).then((result) => {
      if (cancelled) return;
      if (result.error !== null || result.data === null) {
        setListError(result.error ?? t`Integrationen konnten nicht geladen werden.`);
        return;
      }
      setRows(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [server, canList]);

  async function openDetail(integrationID: string) {
    if (!canDetail) return;
    setSelectedID(integrationID);
    setDetail(null);
    setDetailError(null);
    setConnectError(null);
    setConnectNotice(null);
    setOauthAttempt(null);
    setOauthState(null);
    setOauthError(null);
    setKey("");
    setLabel("");
    setAnswerText("");
    setDetailLoading(true);
    const result = await getIntegration(server, integrationID);
    setDetailLoading(false);
    if (result.error !== null || result.data === null) {
      setDetailError(result.error ?? t`Integration konnte nicht geladen werden.`);
      return;
    }
    setDetail(result.data);
  }

  async function handleKeyConnect(e: React.FormEvent) {
    e.preventDefault();
    if (detail === null || connectBusy || !canConnectKey || key.trim() === "") return;
    let answer: Record<string, string | number | boolean | string[]> | undefined;
    if (answerText.trim() !== "") {
      const parsed = parseFormAnswerText(answerText);
      if (parsed.answer === null || parsed.error !== null) {
        setConnectError(parsed.error ?? t`Die Antwort enthält kein gültiges JSON.`);
        return;
      }
      answer = parsed.answer;
    }
    setConnectBusy(true);
    setConnectError(null);
    setConnectNotice(null);
    const result = await connectIntegrationKey(server, detail.id, key.trim(), {
      ...(label.trim() !== "" ? { label: label.trim() } : {}),
      ...(answer !== undefined ? { answer } : {}),
    });
    setConnectBusy(false);
    if (result.error !== null) {
      setConnectError(result.error);
      return;
    }
    setKey("");
    await openDetail(detail.id);
    setConnectNotice(t`Schlüssel gespeichert.`);
  }

  async function handleOauthBegin(methodID: string) {
    if (detail === null || oauthBusy || !canOauth) return;
    setOauthBusy(true);
    setOauthError(null);
    const result = await beginIntegrationOauth(
      server,
      detail.id,
      methodID,
      label.trim() === "" ? undefined : label.trim(),
    );
    setOauthBusy(false);
    if (result.error !== null || result.data === null) {
      setOauthError(result.error ?? t`Anmeldung konnte nicht gestartet werden.`);
      return;
    }
    setOauthAttempt(result.data);
    setOauthState(null);
  }

  async function handleOauthStatus() {
    if (detail === null || oauthAttempt === null || oauthBusy || !canOauth) return;
    setOauthBusy(true);
    setOauthError(null);
    const result = await getIntegrationOauthStatus(server, detail.id, oauthAttempt.attemptID);
    setOauthBusy(false);
    if (result.error !== null || result.data === null) {
      setOauthError(result.error ?? t`Status konnte nicht geladen werden.`);
      return;
    }
    setOauthState(result.data);
  }

  const oauthMethod = detail?.methods.find((m) => m.kind === "oauth" && m.id !== null) ?? null;
  const oauthMethodID = oauthMethod?.id ?? null;
  const keyMethod = detail?.methods.some((m) => m.kind === "key") ?? false;

  return (
    <section className="card bg-base-200 shadow" data-testid="integrations-card">
      <div className="card-body">
        <h2 className="card-title">
          <Icon name="server" /> <Trans>Integrationen</Trans>
        </h2>
        <p className="text-xs opacity-70">
          <Trans>
            Anbieter-Verbindungen: Schlüssel direkt verbinden, OAuth auf der Anbieterseite
            abschließen und hier nur den Status prüfen.
          </Trans>
        </p>
        {listError !== null ? (
          <div className="alert alert-warning">
            <span>{listError}</span>
          </div>
        ) : !canList ? (
          <p className="opacity-70 text-sm">
            <Trans>Server offline – Integrationsliste ist deaktiviert.</Trans>
          </p>
        ) : rows.length === 0 ? (
          <p className="opacity-70 text-sm">
            <Trans>Keine Integrationen.</Trans>
          </p>
        ) : (
          <ul className="menu gap-1" data-testid="integration-list">
            {rows.map((row) => {
              const needsAuth = row.connections.some((c) => c.needsAuth);
              const integrationName = row.name;
              const connectionCount = row.connections.length;
              const connectionLabel =
                connectionCount === 1 ? t`1 Verbindung` : t`${connectionCount} Verbindungen`;
              return (
                <li key={row.id} data-testid={`integration-row-${row.id}`}>
                  <button
                    type="button"
                    className={selectedID === row.id ? "justify-between active" : "justify-between"}
                    disabled={!canDetail}
                    aria-label={t`Details zu Integration ${integrationName} anzeigen`}
                    aria-current={selectedID === row.id ? true : undefined}
                    onClick={() => void openDetail(row.id)}
                  >
                    <span className="truncate">{row.name}</span>
                    <span className="flex gap-1">
                      <span className="badge badge-ghost text-xs">{connectionLabel}</span>
                      {needsAuth && (
                        <span className="badge badge-error badge-sm">
                          <Trans>Anmeldung nötig</Trans>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {detailLoading && <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />}
        {detailError !== null && (
          <div className="alert alert-warning">
            <span>{detailError}</span>
          </div>
        )}
        {detail !== null && (
          <div className="flex flex-col gap-3 border-t border-base-300 pt-3" data-testid="integration-detail">
            <h3 className="font-semibold">{detail.name}</h3>
            <div className="flex flex-wrap gap-1" data-testid="integration-methods">
              {detail.methods.length === 0 ? (
                <span className="text-xs opacity-70">
                  <Trans>Keine Verbindungsmethoden.</Trans>
                </span>
              ) : (
                detail.methods.map((method, index) => (
                  <span
                    key={`${method.kind}-${method.id ?? index}`}
                    className="badge badge-ghost badge-sm"
                    title={method.label ?? undefined}
                  >
                    {METHOD_LABELS[method.kind] ?? method.kind}
                    {method.label !== null && method.label !== (METHOD_LABELS[method.kind] ?? "")
                      ? ` – ${method.label}`
                      : ""}
                  </span>
                ))
              )}
            </div>
            {detail.connections.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Noch nicht verbunden.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="integration-connections">
                {detail.connections.map((connection, index) => (
                  <li
                    key={`${connection.kind}-${connection.label}-${index}`}
                    data-testid={`integration-connection-${index}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`${connectionBadgeClass(connection.needsAuth)} badge-sm`}>
                        {connection.kind === "env" ? (
                          <Trans>Umgebung</Trans>
                        ) : connection.needsAuth ? (
                          <Trans>Anmeldung nötig</Trans>
                        ) : (
                          <Trans>Verbunden</Trans>
                        )}
                      </span>
                      <span className="flex-1 break-all text-sm">{connection.label}</span>
                      {connection.method !== null && (
                        <span className="text-xs opacity-70">{connection.method}</span>
                      )}
                    </div>
                    {connection.message !== null && (
                      <span className="text-xs opacity-70 break-all">{connection.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {keyMethod && (
              <form className="flex flex-col gap-2" onSubmit={(e) => void handleKeyConnect(e)}>
                <h4 className="text-sm font-semibold">
                  <Trans>Mit Schlüssel verbinden</Trans>
                </h4>
                {connectError !== null && (
                  <div className="alert alert-warning">
                    <span>{connectError}</span>
                  </div>
                )}
                {connectNotice !== null && (
                  <div className="alert alert-success">
                    <span>{connectNotice}</span>
                  </div>
                )}
                <input
                  className="input input-bordered input-sm w-full"
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={t`API-Schlüssel …`}
                  aria-label={t`API-Schlüssel`}
                  disabled={!canConnectKey || connectBusy}
                  autoComplete="off"
                  data-testid="integration-key-input"
                />
                <input
                  className="input input-bordered input-sm w-full"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t`Bezeichnung (optional)`}
                  aria-label={t`Bezeichnung für die Verbindung`}
                  disabled={!canConnectKey || connectBusy}
                  data-testid="integration-key-label"
                />
                <details>
                  <summary className="text-xs opacity-70 cursor-pointer">
                    <Trans>Methoden-Antwort als JSON (optional)</Trans>
                  </summary>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full font-mono mt-1"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder={t`{ "feld": "wert" }`}
                    aria-label={t`Methoden-Antwort als JSON`}
                    disabled={!canConnectKey || connectBusy}
                    data-testid="integration-key-answer"
                  />
                </details>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary w-fit"
                  disabled={!canConnectKey || connectBusy || key.trim() === ""}
                  data-testid="integration-key-connect"
                >
                  <Trans>Schlüssel speichern</Trans>
                </button>
              </form>
            )}
            {oauthMethodID !== null && (
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">
                  <Trans>Mit OAuth verbinden</Trans>
                </h4>
                <p className="text-xs opacity-70">
                  <Trans>
                    Die Anmeldung findet auf der Anbieterseite statt (die Weiterleitung verlässt
                    die App); hier wird danach nur der Status geprüft.
                  </Trans>
                </p>
                {oauthError !== null && (
                  <div className="alert alert-warning">
                    <span>{oauthError}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-sm w-fit"
                  disabled={!canOauth || oauthBusy}
                  onClick={() => void handleOauthBegin(oauthMethodID)}
                  data-testid="oauth-begin"
                >
                  <Trans>Anmeldung starten</Trans>
                </button>
                {oauthAttempt !== null && (
                  <div className="flex flex-col gap-1" data-testid="oauth-attempt">
                    {oauthAttempt.instructions !== "" && (
                      <p className="text-sm">{oauthAttempt.instructions}</p>
                    )}
                    <a
                      className="link link-primary text-sm break-all"
                      href={oauthAttempt.url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="oauth-url"
                    >
                      {oauthAttempt.url}
                    </a>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-xs"
                        disabled={!canOauth || oauthBusy}
                        onClick={() => void handleOauthStatus()}
                        data-testid="oauth-status-check"
                      >
                        <Trans>Status prüfen</Trans>
                      </button>
                      {oauthState !== null && (
                        <span
                          className={`${oauthBadgeClass(oauthState.status)} badge-sm`}
                          data-testid="oauth-status"
                        >
                          {OAUTH_STATE_LABELS[oauthState.status]}
                        </span>
                      )}
                    </div>
                    {oauthState?.message != null && (
                      <span className="text-xs opacity-70 break-all">{oauthState.message}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
