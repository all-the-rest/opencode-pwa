import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isActionEnabled, reachability } from "../lib/offline.ts";
import {
  getAgentDetail,
  listModels,
  type AgentDetail as AgentDetailInfo,
  type ModelOption,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

/**
 * Read-only detail of one agent (`GET /api/agent/{id}`): identity, model
 * reference and — resolved over `GET /api/model` — the capabilities of that
 * model (tool use, I/O formats). Reached from the agent list on ServerTools.
 */
export default function AgentDetail() {
  const { id, agentId } = useParams<{ id: string; agentId: string }>();
  const navigate = useNavigate();
  const { servers } = useServers();
  const server = servers.find((s) => s.id === id) ?? null;

  const [detail, setDetail] = useState<AgentDetailInfo | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (server === null || agentId === undefined) return;
    const active = server;
    const activeAgent: string = agentId;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    void Promise.all([getAgentDetail(active, activeAgent), listModels(active)]).then(
      ([detailRes, modelsRes]) => {
        if (cancelled) return;
        const firstError = detailRes.error ?? modelsRes.error;
        if (firstError !== null || detailRes.data === null) {
          setError(firstError ?? t`Agent konnte nicht geladen werden.`);
          return;
        }
        setDetail(detailRes.data);
        setModels(modelsRes.data ?? []);
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [server, agentId]);

  if (server === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">
          <Trans>Server nicht gefunden</Trans>
        </h1>
        <button className="btn btn-primary w-fit" onClick={() => navigate("/")}>
          <Trans>Zurück zur Übersicht</Trans>
        </button>
      </div>
    );
  }

  const { offline } = reachability(error);
  const canReload = isActionEnabled(offline, "agent-detail");
  const agentName = detail?.name ?? agentId ?? "";
  const modelRef = detail?.model ?? null;
  const modelOption =
    modelRef === null
      ? null
      : (models.find((m) => m.providerID === modelRef.providerID && m.id === modelRef.id) ?? null);
  const capabilities = modelOption?.capabilities ?? null;

  return (
    <div className="flex flex-col gap-4" data-testid="agent-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          <Trans>Agent: {agentName}</Trans>
        </h1>
        <Link className="btn btn-sm btn-ghost" to={`/servers/${server.id}/tools`}>
          <Trans>Zurück zu den Server-Werkzeugen</Trans>
        </Link>
      </div>
      {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
      {error !== null && (
        <div className="alert alert-warning">
          <span>
            <Trans>Agent konnte nicht geladen werden: {error}</Trans>
          </span>
        </div>
      )}
      {detail !== null && (
        <div className="card bg-base-200 shadow">
          <div className="card-body">
            <p className="text-sm opacity-70 font-mono break-all">{detail.id}</p>
            {detail.description !== null && <p className="text-sm">{detail.description}</p>}
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div className="flex gap-1">
                <dt className="opacity-70">
                  <Trans>Modus:</Trans>
                </dt>
                <dd>{detail.mode}</dd>
              </div>
            </dl>
            <h2 className="card-title text-base mt-2">
              <Trans>Modell</Trans>
            </h2>
            {modelRef === null ? (
              <p className="opacity-70 text-sm">
                <Trans>Kein Modell zugewiesen.</Trans>
              </p>
            ) : (
              <p className="text-sm font-mono" data-testid="agent-model">
                {modelRef.providerID}/{modelRef.id}
                {modelRef.variant !== undefined && ` (${modelRef.variant})`}
              </p>
            )}
            <h2 className="card-title text-base mt-2">
              <Trans>Fähigkeiten</Trans>
            </h2>
            {capabilities === null ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine Angaben zu den Modellfähigkeiten.</Trans>
              </p>
            ) : (
              <dl className="flex flex-col gap-1 text-sm" data-testid="agent-capabilities">
                <div className="flex gap-1">
                  <dt className="opacity-70">
                    <Trans>Werkzeuge:</Trans>
                  </dt>
                  <dd>{capabilities.tools ? <Trans>Ja</Trans> : <Trans>Nein</Trans>}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="opacity-70">
                    <Trans>Eingabeformate:</Trans>
                  </dt>
                  <dd>{capabilities.input.length > 0 ? capabilities.input.join(", ") : "–"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="opacity-70">
                    <Trans>Ausgabeformate:</Trans>
                  </dt>
                  <dd>{capabilities.output.length > 0 ? capabilities.output.join(", ") : "–"}</dd>
                </div>
              </dl>
            )}
            {!canReload && (
              <p className="text-xs opacity-70">
                <Trans>Server offline – Neuladen ist deaktiviert.</Trans>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
