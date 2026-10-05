import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getServerInfo, listAgents, listSessions } from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

export default function Dashboard() {
  const { servers, selectedServer } = useServers();
  const [info, setInfo] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedServer === null) {
      setInfo(null);
      setSessionCount(null);
      setAgentCount(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getServerInfo(selectedServer),
      listSessions(selectedServer),
      listAgents(selectedServer),
    ])
      .then(([infoRes, sessionsRes, agentsRes]) => {
        if (cancelled) return;
        const firstError =
          infoRes.error ?? sessionsRes.error ?? agentsRes.error;
        if (firstError !== null) {
          setError(firstError);
          setInfo(null);
          setSessionCount(null);
          setAgentCount(null);
          return;
        }
        setInfo(infoRes.data ? `v${infoRes.data.version} (PID ${infoRes.data.pid})` : null);
        const sessions = sessionsRes.data;
        setSessionCount(
          sessions !== null && typeof sessions === "object" && "data" in sessions
            ? (sessions.data as unknown[]).length
            : null,
        );
        const agents = agentsRes.data;
        setAgentCount(Array.isArray(agents) ? agents.length : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Übersicht</h1>

      {selectedServer === null && (
        <div className="alert alert-info">
          <span>
            Kein Server ausgewählt. Lege unter <Link className="link" to="/settings">Einstellungen</Link>{" "}
            einen Server an.
          </span>
        </div>
      )}

      {selectedServer !== null && (
        <section className="card bg-base-200 shadow">
          <div className="card-body">
            <h2 className="card-title">Aktiver Server: {selectedServer.name}</h2>
            <p className="text-sm opacity-70">{selectedServer.baseUrl}</p>
            {loading && <span className="loading loading-spinner loading-md" aria-label="Lädt" />}
            {error !== null && (
              <div className="alert alert-warning">
                <span>Server offline oder nicht erreichbar: {error}</span>
              </div>
            )}
            {error === null && !loading && (
              <dl className="stats stats-vertical sm:stats-horizontal shadow mt-2">
                <div className="stat">
                  <div className="stat-title">Version</div>
                  <div className="stat-value text-lg">{info ?? "–"}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Laufende Sessions</div>
                  <div className="stat-value text-lg">{sessionCount ?? "–"}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Agenten</div>
                  <div className="stat-value text-lg">{agentCount ?? "–"}</div>
                </div>
              </dl>
            )}
            <div className="card-actions mt-2">
              <Link className="btn btn-primary btn-sm" to={`/servers/${selectedServer.id}`}>
                Details öffnen
              </Link>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Alle Server ({servers.length})</h2>
        {servers.length === 0 ? (
          <p className="opacity-70">Noch keine Server vorhanden.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {servers.map((s) => (
              <li key={s.id} className="card bg-base-200 shadow">
                <div className="card-body p-4">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm opacity-70">{s.baseUrl}</span>
                  <div className="card-actions">
                    <Link className="btn btn-sm btn-ghost" to={`/servers/${s.id}`}>
                      Anzeigen
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
