import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listPtys, listSessions, listShells } from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

interface Row {
  id: string;
  label: string;
}

function extractRows(value: unknown): Row[] {
  if (value === null || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.map((entry, index) => {
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const id = typeof record["id"] === "string" ? record["id"] : `eintrag-${index}`;
      const label =
        typeof record["title"] === "string"
          ? record["title"]
          : typeof record["name"] === "string"
            ? record["name"]
            : typeof record["command"] === "string"
              ? record["command"]
              : id;
      return { id, label };
    }
    return { id: `eintrag-${index}`, label: String(entry) };
  });
}

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers } = useServers();
  const server = servers.find((s) => s.id === id) ?? null;

  const [sessions, setSessions] = useState<Row[]>([]);
  const [shells, setShells] = useState<Row[]>([]);
  const [ptys, setPtys] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (server === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listSessions(server), listShells(server), listPtys(server)])
      .then(([sessionsRes, shellsRes, ptysRes]) => {
        if (cancelled) return;
        const firstError = sessionsRes.error ?? shellsRes.error ?? ptysRes.error;
        if (firstError !== null) {
          setError(firstError);
          setSessions([]);
          setShells([]);
          setPtys([]);
          return;
        }
        setSessions(extractRows(sessionsRes.data));
        setShells(extractRows(shellsRes.data));
        setPtys(extractRows(ptysRes.data));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [server]);

  if (server === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Server nicht gefunden</h1>
        <button className="btn btn-primary w-fit" onClick={() => navigate("/")}>
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Server: {server.name}</h1>
      <p className="text-sm opacity-70">{server.baseUrl}</p>
      {loading && <span className="loading loading-spinner loading-md" aria-label="Lädt" />}
      {error !== null && (
        <div className="alert alert-warning">
          <span>Server offline oder nicht erreichbar: {error}</span>
        </div>
      )}
      {!loading && error === null && (
        <div className="grid gap-4 md:grid-cols-3">
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">Sessions ({sessions.length})</h2>
              {sessions.length === 0 ? (
                <p className="opacity-70 text-sm">Keine Sessions.</p>
              ) : (
                <ul className="menu gap-1">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <Link to={`/sessions/${s.id}?server=${server.id}`}>{s.label}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">Shells ({shells.length})</h2>
              {shells.length === 0 ? (
                <p className="opacity-70 text-sm">Keine Shells.</p>
              ) : (
                <ul className="menu gap-1">
                  {shells.map((s) => (
                    <li key={s.id}>
                      <span>{s.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">PTYs ({ptys.length})</h2>
              {ptys.length === 0 ? (
                <p className="opacity-70 text-sm">Keine PTYs.</p>
              ) : (
                <ul className="menu gap-1">
                  {ptys.map((p) => (
                    <li key={p.id}>
                      <span>{p.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
