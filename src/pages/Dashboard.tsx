import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ServerDot from "../components/ServerDot.tsx";
import { useLiveRefresh } from "../hooks/useLiveRefresh.ts";
import { reachability } from "../lib/offline.ts";
import {
  getServerInfo,
  listAgents,
  listProjects,
  listSessions,
  listShells,
  type ServerConfig,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

interface Counts {
  info: string | null;
  sessions: number | null;
  shells: number | null;
  agents: number | null;
  projects: number | null;
}

async function loadCounts(server: ServerConfig): Promise<Counts> {
  const [infoRes, sessionsRes, shellsRes, agentsRes, projectsRes] = await Promise.all([
    getServerInfo(server),
    listSessions(server),
    listShells(server),
    listAgents(server),
    listProjects(server),
  ]);
  const firstError =
    infoRes.error ?? sessionsRes.error ?? shellsRes.error ?? agentsRes.error ?? projectsRes.error;
  if (firstError !== null) throw new Error(firstError);
  const sessions = sessionsRes.data;
  const shells = shellsRes.data;
  const agents = agentsRes.data;
  const shellsData: unknown = shells !== null && typeof shells === "object" ? (shells as { data?: unknown }).data : null;
  // agent.list is normalized to `AgentOption[]` by `listAgents`.
  return {
    info: infoRes.data ? `v${infoRes.data.version} (PID ${infoRes.data.pid})` : null,
    sessions:
      sessions !== null && typeof sessions === "object" && "data" in sessions
        ? (sessions.data as unknown[]).length
        : null,
    shells: Array.isArray(shellsData) ? shellsData.length : null,
    agents: Array.isArray(agents) ? agents.length : null,
    projects: projectsRes.data === null ? null : projectsRes.data.length,
  };
}

export default function Dashboard() {
  const { servers, selectedServer } = useServers();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedServerName = selectedServer?.name ?? "";
  const serverCount = servers.length;

  const reload = useCallback(() => {
    if (selectedServer === null) return;
    const active: ServerConfig = selectedServer;
    void loadCounts(active)
      .then((next) => {
        setCounts(next);
        setError(null);
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : t`Unbekannter Fehler`);
        setCounts(null);
      });
  }, [selectedServer]);

  useEffect(() => {
    if (selectedServer === null) {
      setCounts(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadCounts(selectedServer)
      .then((next) => {
        if (cancelled) return;
        setCounts(next);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(failure instanceof Error ? failure.message : t`Unbekannter Fehler`);
        setCounts(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer]);

  // Live counters: poll every 5s + refresh on event-hub activity.
  useLiveRefresh(selectedServer, reload);

  // Owner requirement: a server that stops answering is never removed from
  // the list — it stays configured and is badged as offline instead.
  const { offline } = reachability(error);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        <Trans>Übersicht</Trans>
      </h1>

      {selectedServer === null && (
        <div className="alert alert-info">
          <span>
            <Trans>
              Kein Server ausgewählt. Lege unter{" "}
              <Link className="link" to="/settings">
                Einstellungen
              </Link>{" "}
              einen Server an.
            </Trans>
          </span>
        </div>
      )}

      {selectedServer !== null && (
        <section className="card bg-base-200 shadow">
          <div className="card-body">
            <h2 className="card-title">
              <ServerDot server={selectedServer} testId="dashboard-server-dot" />
              <Trans>Aktiver Server: {selectedServerName}</Trans>
            </h2>
            <p className="text-sm opacity-70">{selectedServer.baseUrl}</p>
            {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
            {error !== null && (
              <div className="alert alert-warning">
                <span>
                  <Trans>Server offline oder nicht erreichbar: {error}</Trans>
                </span>
              </div>
            )}
            {error === null && !loading && (
              <dl className="stats stats-vertical sm:stats-horizontal shadow mt-2">
                <div className="stat">
                  <div className="stat-title">
                    <Trans>Version</Trans>
                  </div>
                  <div className="stat-value text-lg">{counts?.info ?? "–"}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">
                    <Trans>Laufende Sessions</Trans>
                  </div>
                  <div className="stat-value text-lg" data-testid="badge-sessions">
                    {counts?.sessions ?? "–"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-title">
                    <Trans>Laufende Shells</Trans>
                  </div>
                  <div className="stat-value text-lg" data-testid="badge-shells">
                    {counts?.shells ?? "–"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-title">
                    <Trans>Agenten</Trans>
                  </div>
                  <div className="stat-value text-lg" data-testid="badge-agents">
                    {counts?.agents ?? "–"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-title">
                    <Trans>Projekte</Trans>
                  </div>
                  <div className="stat-value text-lg">{counts?.projects ?? "–"}</div>
                </div>
              </dl>
            )}
            <div className="card-actions mt-2">
              <Link className="btn btn-primary btn-sm" to={`/servers/${selectedServer.id}`}>
                <Trans>Details öffnen</Trans>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">
          <Trans>Alle Server ({serverCount})</Trans>
        </h2>
        {servers.length === 0 ? (
          <p className="opacity-70">
            <Trans>Noch keine Server vorhanden.</Trans>
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {servers.map((s) => {
              const isOffline = offline && s.id === selectedServer?.id;
              return (
              <li key={s.id} className="card bg-base-200 shadow">
                <div className="card-body p-4">
                  <span className="font-semibold flex items-center gap-2">
                    <ServerDot server={s} />
                    {s.name}
                  </span>
                  <span className="text-sm opacity-70">{s.baseUrl}</span>
                  {isOffline && (
                    <span className="badge badge-warning w-fit" data-testid="dashboard-offline-badge">
                      <Trans>Offline</Trans>
                    </span>
                  )}
                  <div className="card-actions">
                    <Link className="btn btn-sm btn-ghost" to={`/servers/${s.id}`}>
                      <Trans>Anzeigen</Trans>
                    </Link>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
