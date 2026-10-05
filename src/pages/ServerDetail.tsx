import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  extractProjects,
  extractSessionRows,
  groupSessionsByProject,
  listProjects,
  listPtys,
  listSessions,
  listShells,
  type ProjectGroup,
  type ProjectInfo,
} from "../lib/opencode.ts";
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

  const [sessionGroups, setSessionGroups] = useState<ProjectGroup[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [shells, setShells] = useState<Row[]>([]);
  const [ptys, setPtys] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionCount = sessionGroups.reduce((sum, g) => sum + g.sessions.length, 0);

  useEffect(() => {
    if (server === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listSessions(server), listShells(server), listPtys(server), listProjects(server)])
      .then(([sessionsRes, shellsRes, ptysRes, projectsRes]) => {
        if (cancelled) return;
        const firstError =
          sessionsRes.error ?? shellsRes.error ?? ptysRes.error ?? projectsRes.error;
        if (firstError !== null) {
          setError(firstError);
          setSessionGroups([]);
          setProjects([]);
          setShells([]);
          setPtys([]);
          return;
        }
        const projectList =
          projectsRes.data ?? extractProjects(sessionsRes.data);
        setProjects(projectList);
        setSessionGroups(
          groupSessionsByProject(extractSessionRows(sessionsRes.data), projectList),
        );
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">Projekte ({projects.length})</h2>
              {projects.length === 0 ? (
                <p className="opacity-70 text-sm">Keine Projekte.</p>
              ) : (
                <ul className="menu gap-1">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <span title={p.id}>{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">Sessions ({sessionCount})</h2>
              {sessionGroups.length === 0 ? (
                <p className="opacity-70 text-sm">Keine Sessions.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sessionGroups.map((group) => (
                    <div key={group.key}>
                      <h3 className="text-sm font-semibold opacity-80 mb-1" title={group.key}>
                        {group.label} ({group.sessions.length})
                      </h3>
                      <ul className="menu gap-1">
                        {group.sessions.map((s) => (
                          <li key={s.id}>
                            <Link to={`/sessions/${s.id}?server=${server.id}`}>{s.label}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
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
