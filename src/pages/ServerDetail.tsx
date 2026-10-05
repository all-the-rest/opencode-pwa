import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import Icon from "../components/Icon.tsx";
import { useLiveRefresh } from "../hooks/useLiveRefresh.ts";
import {
  createShell,
  extractProjects,
  extractPtyTicket,
  filterSessionRows,
  getPtyConnectToken,
  getShellOutput,
  groupSessionsByProject,
  interruptSession,
  listProjects,
  listPtys,
  listSessionsPaged,
  listShells,
  removeSession,
  removeShell,
  type ProjectInfo,
  type ServerConfig,
  type SessionRow,
  type ShellOutput,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

const SESSION_PAGE_LIMIT = 50;

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

type KillKind = "session-interrupt" | "session-delete" | "shell-remove";

interface KillTarget {
  kind: KillKind;
  id: string;
  label: string;
}

function killTitle(target: KillTarget): string {
  if (target.kind === "session-interrupt") return t`Ausführung unterbrechen`;
  if (target.kind === "session-delete") return t`Session löschen`;
  return t`Shell entfernen`;
}

function killMessage(target: KillTarget): string {
  const { label } = target;
  if (target.kind === "session-interrupt") {
    return t`Die laufende Ausführung der Session „${label}“ wird unterbrochen. Die Session selbst bleibt erhalten. Fortfahren?`;
  }
  if (target.kind === "session-delete") {
    return t`Die Session „${label}“ wird endgültig gelöscht. Fortfahren?`;
  }
  return t`Die Shell „${label}“ wird abgebrochen und entfernt. Fortfahren?`;
}

function killConfirmLabel(target: KillTarget): string {
  if (target.kind === "session-interrupt") return t`Unterbrechen`;
  if (target.kind === "session-delete") return t`Löschen`;
  return t`Entfernen`;
}

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers } = useServers();
  const server = servers.find((s) => s.id === id) ?? null;

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [shells, setShells] = useState<Row[]>([]);
  const [ptys, setPtys] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [agentFilter, setAgentFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");

  const [killTarget, setKillTarget] = useState<KillTarget | null>(null);
  const [killBusy, setKillBusy] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);

  const [shellOutputs, setShellOutputs] = useState<Record<string, ShellOutput>>({});
  const [shellOutputError, setShellOutputError] = useState<string | null>(null);
  const [expandedShell, setExpandedShell] = useState<string | null>(null);
  const [newCommand, setNewCommand] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [ptyTickets, setPtyTickets] = useState<Record<string, string>>({});
  const [ptyTicketError, setPtyTicketError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (server === null) return;
    const active: ServerConfig = server;
    void Promise.all([
      listSessionsPaged(active, { limit: SESSION_PAGE_LIMIT }),
      listShells(active),
      listPtys(active),
      listProjects(active),
    ]).then(([sessionsRes, shellsRes, ptysRes, projectsRes]) => {
      const firstError =
        sessionsRes.error ?? shellsRes.error ?? ptysRes.error ?? projectsRes.error;
      if (firstError !== null) {
        setError(firstError);
        return;
      }
      if (sessionsRes.data !== null) {
        setSessions(sessionsRes.data.rows);
        setNextCursor(sessionsRes.data.cursor.next);
      }
      const projectList = projectsRes.data ?? extractProjects(sessionsRes.data);
      setProjects(projectList);
      setShells(extractRows(shellsRes.data));
      setPtys(extractRows(ptysRes.data));
      setError(null);
    });
  }, [server]);

  useEffect(() => {
    if (server === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSessions([]);
    setNextCursor(null);
    setAgentFilter("");
    setProjectFilter("");
    setSearch("");
    setShellOutputs({});
    setExpandedShell(null);
    setPtyTickets({});
    Promise.all([
      listSessionsPaged(server, { limit: SESSION_PAGE_LIMIT }),
      listShells(server),
      listPtys(server),
      listProjects(server),
    ])
      .then(([sessionsRes, shellsRes, ptysRes, projectsRes]) => {
        if (cancelled) return;
        const firstError =
          sessionsRes.error ?? shellsRes.error ?? ptysRes.error ?? projectsRes.error;
        if (firstError !== null) {
          setError(firstError);
          setSessions([]);
          setProjects([]);
          setShells([]);
          setPtys([]);
          return;
        }
        if (sessionsRes.data !== null) {
          setSessions(sessionsRes.data.rows);
          setNextCursor(sessionsRes.data.cursor.next);
        }
        const projectList =
          projectsRes.data ?? extractProjects(sessionsRes.data);
        setProjects(projectList);
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

  // Live counters + lists: poll every 5s + refresh on event-hub activity.
  useLiveRefresh(server, reload);

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

  const activeServer: ServerConfig = server;
  const serverName = server.name;
  const projectCount = projects.length;
  const shellCount = shells.length;
  const ptyCount = ptys.length;

  async function loadMoreSessions() {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const result = await listSessionsPaged(activeServer, {
      limit: SESSION_PAGE_LIMIT,
      cursor: nextCursor,
    });
    setLoadingMore(false);
    if (result.error !== null || result.data === null) {
      setError(result.error ?? t`Sessions konnten nicht nachgeladen werden.`);
      return;
    }
    const known = new Set(sessions.map((s) => s.id));
    const page = result.data;
    setSessions((prev) => [...prev, ...page.rows.filter((r) => !known.has(r.id))]);
    setNextCursor(page.cursor.next);
  }

  async function confirmKill() {
    if (killTarget === null || killBusy) return;
    const target = killTarget;
    setKillBusy(true);
    setKillError(null);
    const result =
      target.kind === "session-interrupt"
        ? await interruptSession(activeServer, target.id)
        : target.kind === "session-delete"
          ? await removeSession(activeServer, target.id)
          : await removeShell(activeServer, target.id);
    setKillBusy(false);
    if (result.error !== null) {
      setKillError(result.error);
      return;
    }
    setKillTarget(null);
    if (target.kind === "session-delete") {
      setSessions((prev) => prev.filter((s) => s.id !== target.id));
    }
    if (target.kind === "shell-remove") {
      setShells((prev) => prev.filter((s) => s.id !== target.id));
    }
    reload();
  }

  async function toggleShellOutput(shellId: string) {
    if (expandedShell === shellId) {
      setExpandedShell(null);
      return;
    }
    setExpandedShell(shellId);
    setShellOutputError(null);
    const cached = shellOutputs[shellId];
    const result = await getShellOutput(
      activeServer,
      shellId,
      cached === undefined ? undefined : cached.cursor,
    );
    if (result.error !== null || result.data === null) {
      setShellOutputError(result.error ?? t`Ausgabe konnte nicht geladen werden.`);
      return;
    }
    const fresh = result.data;
    const startedAtZero = fresh.cursor === 0;
    setShellOutputs((prev) => {
      const previous = prev[shellId];
      const merged: ShellOutput =
        previous === undefined || startedAtZero
          ? fresh
          : { output: previous.output + fresh.output, cursor: fresh.cursor, truncated: fresh.truncated };
      return { ...prev, [shellId]: merged };
    });
  }

  async function handleCreateShell(e: React.FormEvent) {
    e.preventDefault();
    const command = newCommand.trim();
    if (command === "" || creating) return;
    setCreating(true);
    setCreateError(null);
    const result = await createShell(activeServer, command);
    setCreating(false);
    if (result.error !== null) {
      setCreateError(result.error);
      return;
    }
    setNewCommand("");
    reload();
  }

  async function handlePtyTicket(ptyID: string) {
    setPtyTicketError(null);
    const result = await getPtyConnectToken(activeServer, ptyID);
    if (result.error !== null || result.data === null) {
      setPtyTicketError(result.error ?? t`Token konnte nicht angefordert werden.`);
      return;
    }
    const ticket = extractPtyTicket(result.data);
    if (ticket === null) {
      setPtyTicketError(t`Unerwartete Token-Antwort vom Server.`);
      return;
    }
    setPtyTickets((prev) => ({ ...prev, [ptyID]: ticket }));
  }

  const agents = [...new Set(sessions.map((s) => s.agent).filter((a): a is string => a !== null))].sort();
  const filtered = filterSessionRows(sessions, {
    agent: agentFilter === "" ? null : agentFilter,
    projectKey: projectFilter === "" ? null : projectFilter,
    search,
  });
  const sessionGroups = groupSessionsByProject(filtered, projects);
  const sessionCount = filtered.length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        <Trans>Server: {serverName}</Trans>
      </h1>
      <p className="text-sm opacity-70">{server.baseUrl}</p>
      {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
      {error !== null && (
        <div className="alert alert-warning">
          <span>
            <Trans>Server offline oder nicht erreichbar: {error}</Trans>
          </span>
        </div>
      )}
      {!loading && error === null && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">
                <Icon name="project" /> <Trans>Projekte ({projectCount})</Trans>
              </h2>
              {projects.length === 0 ? (
                <p className="opacity-70 text-sm">
                  <Trans>Keine Projekte.</Trans>
                </p>
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
              <h2 className="card-title">
                <Icon name="session" /> <Trans>Sessions ({sessionCount})</Trans>
              </h2>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="label label-text">
                    <Trans>Suche</Trans>
                  </span>
                  <input
                    className="input input-bordered input-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t`Titel oder ID suchen`}
                    aria-label={t`Sessions suchen`}
                  />
                </label>
                <div className="flex gap-2">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="label label-text">
                      <Trans>Agent</Trans>
                    </span>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={agentFilter}
                      onChange={(e) => setAgentFilter(e.target.value)}
                      aria-label={t`Nach Agent filtern`}
                    >
                      <option value="">
                        <Trans>Alle Agenten</Trans>
                      </option>
                      {agents.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="label label-text">
                      <Trans>Projekt</Trans>
                    </span>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={projectFilter}
                      onChange={(e) => setProjectFilter(e.target.value)}
                      aria-label={t`Nach Projekt filtern`}
                    >
                      <option value="">
                        <Trans>Alle Projekte</Trans>
                      </option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {sessionGroups.length === 0 ? (
                <p className="opacity-70 text-sm">
                  <Trans>Keine Sessions.</Trans>
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sessionGroups.map((group) => (
                    <div key={group.key}>
                      <h3 className="text-sm font-semibold opacity-80 mb-1" title={group.key}>
                        {group.label} ({group.sessions.length})
                      </h3>
                      <ul className="menu gap-1">
                        {group.sessions.map((s) => {
                          const label = s.label;
                          return (
                          <li key={s.id}>
                            <div className="flex items-center gap-1">
                              <Link
                                className="flex-1"
                                to={`/sessions/${s.id}?server=${server.id}`}
                              >
                                {s.label}
                              </Link>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                title={t`Ausführung unterbrechen`}
                                aria-label={t`Session ${label} unterbrechen`}
                                onClick={() =>
                                  setKillTarget({ kind: "session-interrupt", id: s.id, label: s.label })
                                }
                              >
                                <Icon name="stop" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost text-error"
                                title={t`Session löschen`}
                                aria-label={t`Session ${label} löschen`}
                                onClick={() =>
                                  setKillTarget({ kind: "session-delete", id: s.id, label: s.label })
                                }
                              >
                                <Icon name="trash" />
                              </button>
                            </div>
                          </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {nextCursor !== null && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => void loadMoreSessions()}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Trans>Lädt …</Trans> : <Trans>Weitere Sessions laden</Trans>}
                </button>
              )}
            </div>
          </section>
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">
                <Icon name="shell" /> <Trans>Shells ({shellCount})</Trans>
              </h2>
              <form className="flex gap-2" onSubmit={(e) => void handleCreateShell(e)}>
                <input
                  className="input input-bordered input-sm flex-1"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  placeholder={t`Befehl starten, z. B. sleep 60`}
                  aria-label={t`Neuer Shell-Befehl`}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={creating || newCommand.trim() === ""}
                  aria-label={t`Shell starten`}
                >
                  <Icon name="plus" />
                </button>
              </form>
              {createError !== null && (
                <div className="alert alert-error">
                  <span>{createError}</span>
                </div>
              )}
              {shellOutputError !== null && (
                <div className="alert alert-warning">
                  <span>{shellOutputError}</span>
                </div>
              )}
              {shells.length === 0 ? (
                <p className="opacity-70 text-sm">
                  <Trans>Keine Shells.</Trans>
                </p>
              ) : (
                <ul className="menu gap-1">
                  {shells.map((s) => {
                    const label = s.label;
                    const shellExpanded = expandedShell === s.id;
                    return (
                    <li key={s.id}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="flex-1">{s.label}</span>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            aria-label={
                              shellExpanded
                                ? t`Ausgabe von ${label} ausblenden`
                                : t`Ausgabe von ${label} anzeigen`
                            }
                            onClick={() => void toggleShellOutput(s.id)}
                          >
                            {shellExpanded ? <Trans>Ausblenden</Trans> : <Trans>Ausgabe</Trans>}
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost text-error"
                            title={t`Shell entfernen`}
                            aria-label={t`Shell ${label} entfernen`}
                            onClick={() => {
                              setKillError(null);
                              setKillTarget({ kind: "shell-remove", id: s.id, label: s.label });
                            }}
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                        {shellExpanded && (
                          <pre
                            className="text-xs bg-base-300 rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-auto"
                            data-testid={`shell-output-${s.id}`}
                          >
                            {shellOutputs[s.id]?.output ?? t`Ausgabe wird geladen …`}
                          </pre>
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
          <section className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">
                <Icon name="pty" /> <Trans>PTYs ({ptyCount})</Trans>
              </h2>
              <p className="text-xs opacity-70">
                <Trans>
                  Hinweis: Terminal-Rendering folgt nach MVP. Ein Connect-Token kann pro PTY
                  angefordert werden (für externe Terminal-Clients).
                </Trans>
              </p>
              {ptyTicketError !== null && (
                <div className="alert alert-warning">
                  <span>{ptyTicketError}</span>
                </div>
              )}
              {ptys.length === 0 ? (
                <p className="opacity-70 text-sm">
                  <Trans>Keine PTYs.</Trans>
                </p>
              ) : (
                <ul className="menu gap-1">
                  {ptys.map((p) => {
                    const label = p.label;
                    return (
                    <li key={p.id}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="flex-1">{p.label}</span>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            aria-label={t`Connect-Token für ${label} anfordern`}
                            onClick={() => void handlePtyTicket(p.id)}
                          >
                            <Trans>Token</Trans>
                          </button>
                        </div>
                        {ptyTickets[p.id] !== undefined && (
                          <p
                            className="text-xs font-mono break-all bg-base-300 rounded p-2"
                            data-testid={`pty-token-${p.id}`}
                          >
                            {ptyTickets[p.id]}
                          </p>
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
      <ConfirmDialog
        open={killTarget !== null}
        title={killTarget === null ? "" : killTitle(killTarget)}
        message={killTarget === null ? "" : killMessage(killTarget)}
        confirmLabel={killTarget === null ? "" : killConfirmLabel(killTarget)}
        busy={killBusy}
        error={killError}
        onConfirm={() => void confirmKill()}
        onCancel={() => {
          if (!killBusy) {
            setKillTarget(null);
            setKillError(null);
          }
        }}
      />
    </div>
  );
}
