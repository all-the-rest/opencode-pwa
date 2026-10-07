import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import ContentSkeleton from "../components/ContentSkeleton.tsx";
import Icon from "../components/Icon.tsx";
import ServerDot from "../components/ServerDot.tsx";
import ServerStatusBadge from "../components/ServerStatusBadge.tsx";
import { useLiveRefresh, LIVE_REFRESH_INTERVAL_MS } from "../hooks/useLiveRefresh.ts";
import { useShellOutputStream } from "../hooks/useShellOutputStream.ts";
import { isActionEnabled, reachability } from "../lib/offline.ts";
import {
  createShell,
  extractProjects,
  extractPtyTicket,
  filterSessionRows,
  getPtyConnectToken,
  groupSessionsByProject,
  interruptSession,
  listProjects,
  listPtys,
  listSessionsPaged,
  listShells,
  removeSession,
  removeShell,
  updateProjectName,
  type ProjectInfo,
  type ServerConfig,
  type SessionRow,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";
import { useLayoutMode } from "../state/layoutMode.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";
import { serverColor } from "../lib/serverColor.ts";

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

interface ShellRowProps {
  server: ServerConfig;
  shell: Row;
  expanded: boolean;
  /** Server unreachable: output tail and removal are disabled. */
  offline: boolean;
  onToggle: () => void;
  onRequestRemove: (id: string, label: string) => void;
}

/**
 * One shell row with a tail-polled output panel: while expanded, the output
 * is fetched from the start and then polled every 2s (cursor-paged); polling
 * stops on collapse and unmount. A "Live" badge shows while the tail runs.
 *
 * While `offline` the row is marked offline and every action is disabled —
 * the shell itself is never removed on reachability loss.
 */
function ShellRow({
  server,
  shell,
  expanded,
  offline,
  onToggle,
  onRequestRemove,
}: ShellRowProps) {
  const { output, loading, error, live } = useShellOutputStream(server, shell.id, expanded);
  const label = shell.label;
  const canTail = isActionEnabled(offline, "shell-output");
  const canRemove = isActionEnabled(offline, "shell-remove");
  return (
    <li>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="flex-1">{shell.label}</span>
          {offline && <OfflineBadge />}
          {live && (
            <span className="badge badge-success" data-testid={`shell-live-${shell.id}`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <Trans>Live</Trans>
            </span>
          )}
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            disabled={!canTail}
            aria-label={
              expanded
                ? t`Ausgabe von ${label} ausblenden`
                : t`Ausgabe von ${label} anzeigen`
            }
            onClick={onToggle}
          >
            {expanded ? <Trans>Ausblenden</Trans> : <Trans>Ausgabe</Trans>}
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost text-error"
            disabled={!canRemove}
            title={t`Shell entfernen`}
            aria-label={t`Shell ${label} entfernen`}
            onClick={() => onRequestRemove(shell.id, shell.label)}
          >
            <Icon name="trash" />
          </button>
        </div>
        {expanded && (
          <pre
            className="text-xs bg-base-300 rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-auto"
            data-testid={`shell-output-${shell.id}`}
          >
            {loading && output === "" ? t`Ausgabe wird geladen …` : output}
          </pre>
        )}
        {expanded && error !== null && (
          <div className="alert alert-warning">
            <span>{error}</span>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Visual "offline" marker. Paired with `disabled` on every action button so
 * screen readers get `aria-disabled` for free from the disabled state.
 */
function OfflineBadge({ testId = "offline-badge" }: { testId?: string }) {
  return (
    <span className="badge badge-warning gap-1" data-testid={testId}>
      <Trans>Offline</Trans>
    </span>
  );
}

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, updateServer, removeServer } = useServers();
  const { openTab } = useSessionTabs();
  const { split } = useLayoutMode();
  const server = servers.find((s) => s.id === id) ?? null;

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [shells, setShells] = useState<Row[]>([]);
  const [ptys, setPtys] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // View state lives in query params (clean, shareable URLs): `?search=`,
  // `?agent=`, `?project=`. Pagination cursors stay local state.
  const [searchParams, setSearchParams] = useSearchParams();
  const agentFilter = searchParams.get("agent") ?? "";
  const projectFilter = searchParams.get("project") ?? "";
  const search = searchParams.get("search") ?? "";

  function updateParam(key: "agent" | "project" | "search", value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  // Filters are per server: switching servers clears them, but a fresh mount
  // (e.g. a deep link with `?agent=` from the dashboard spectator view) keeps
  // the params from the URL.
  const prevServerIdRef = useRef<string | null>(null);

  const [killTarget, setKillTarget] = useState<KillTarget | null>(null);
  const [killBusy, setKillBusy] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);

  const [expandedShell, setExpandedShell] = useState<string | null>(null);
  const [newCommand, setNewCommand] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [ptyTickets, setPtyTickets] = useState<Record<string, string>>({});
  const [ptyTicketError, setPtyTicketError] = useState<string | null>(null);

  // Inline rename. The server entry itself is client-side only (updateServer
  // touches just the stored entry), but when the server has exactly one
  // project the rename can be wired through to it via PATCH
  // /api/project/{projectID} — behind a German confirm and the offline guard.
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [projectRename, setProjectRename] = useState<{
    projectID: string;
    projectName: string;
    newName: string;
  } | null>(null);
  const [projectRenameBusy, setProjectRenameBusy] = useState(false);
  const [projectRenameError, setProjectRenameError] = useState<string | null>(null);
  // Server delete is local-only as well: it removes the stored entry (and its
  // vault credential) and never touches the server itself.
  const [confirmDeleteServer, setConfirmDeleteServer] = useState(false);

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
    if (prevServerIdRef.current !== null && prevServerIdRef.current !== server.id) {
      setSearchParams({}, { replace: true });
    }
    prevServerIdRef.current = server.id;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSessions([]);
    setNextCursor(null);
    setExpandedShell(null);
    setPtyTickets({});
    setRenaming(false);
    setRenameValue("");
    setRenameError(null);
    setProjectRename(null);
    setProjectRenameError(null);
    setConfirmDeleteServer(false);
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
  }, [server, setSearchParams]);

  // Live counters + lists: poll every 5s + refresh on event-hub activity.
  // Paused while a shell output panel is open — its 2s tail-poll is the live
  // view there, and the list refresh would only overlap it.
  useLiveRefresh(server, reload, LIVE_REFRESH_INTERVAL_MS, expandedShell === null);

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
  // Owner requirement: an unreachable server stays in the list (never removed,
  // never a delete prompt). Its rows stay visible but disabled + badged.
  const { offline } = reachability(error);
  const canInterrupt = isActionEnabled(offline, "session-interrupt");
  const canDeleteSession = isActionEnabled(offline, "session-delete");
  const canLoadMore = isActionEnabled(offline, "sessions-load-more");
  const canCreateShell = isActionEnabled(offline, "shell-create");
  const canPtyToken = isActionEnabled(offline, "pty-token");

  async function loadMoreSessions() {
    if (nextCursor === null || loadingMore || !canLoadMore) return;
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
    // Offline guard: never delete anything on reachability loss.
    if (offline) {
      setKillError(t`Server ist offline – Aktionen sind deaktiviert.`);
      return;
    }
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

  function toggleShellOutput(shellId: string) {
    setExpandedShell((current) => (current === shellId ? null : shellId));
  }

  async function handleCreateShell(e: React.FormEvent) {
    e.preventDefault();
    const command = newCommand.trim();
    if (command === "" || creating || !canCreateShell) return;
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
    if (!canPtyToken) return;
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

  async function handleRename() {
    const name = renameValue.trim();
    if (name === "" || renameBusy) {
      setRenameError(t`Name darf nicht leer sein.`);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      // Local-only: baseUrl/username stay as-is, blank password keeps the
      // vault credential, omitted color keeps the stored color. No API call,
      // so an unreachable server is never modified remotely.
      await updateServer(activeServer.id, {
        name,
        baseUrl: activeServer.baseUrl,
        username: activeServer.username,
        password: "",
      });
      setRenaming(false);
      // Server-side rename: only with exactly one project is the mapping
      // unambiguous. Zero projects: nothing to rename. More than one: the
      // app never guesses which project a server label refers to.
      if (projects.length === 1) {
        const only = projects[0];
        if (only !== undefined) {
          setProjectRename({ projectID: only.id, projectName: only.name, newName: name });
        }
      }
    } catch (failure) {
      setRenameError(
        failure instanceof Error ? failure.message : t`Umbenennen fehlgeschlagen.`,
      );
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmProjectRename() {
    if (projectRename === null || projectRenameBusy) return;
    // Offline guard: never write to an unreachable server.
    if (offline) {
      setProjectRenameError(t`Server ist offline – Aktionen sind deaktiviert.`);
      return;
    }
    setProjectRenameBusy(true);
    setProjectRenameError(null);
    const result = await updateProjectName(activeServer, projectRename.projectID, projectRename.newName);
    setProjectRenameBusy(false);
    if (result.error !== null) {
      setProjectRenameError(result.error);
      return;
    }
    setProjectRename(null);
    reload();
  }

  function handleDeleteServer() {
    // Local-only: removes the stored entry (and its vault credential); the
    // server itself is never contacted and stays untouched.
    removeServer(activeServer.id);
    setConfirmDeleteServer(false);
    navigate("/");
  }

  const agents = [...new Set(sessions.map((s) => s.agent).filter((a): a is string => a !== null))].sort();
  const filtered = filterSessionRows(sessions, {
    agent: agentFilter === "" ? null : agentFilter,
    projectKey: projectFilter === "" ? null : projectFilter,
    search,
  });
  const sessionGroups = groupSessionsByProject(filtered, projects);
  const sessionCount = filtered.length;
  // Lingui-safe hoists: no member access inside `t` messages.
  const projectRenameName = projectRename?.projectName ?? "";
  const projectRenameNewName = projectRename?.newName ?? "";

  return (
    <div className="flex flex-col gap-4">
      <h1
        className="text-2xl font-bold flex items-center gap-2 pb-1 border-b-2"
        style={{ borderColor: serverColor(activeServer) }}
      >
        <ServerDot server={activeServer} testId="server-detail-dot" />
        <Trans>Server: {serverName}</Trans>
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm opacity-70">{server.baseUrl}</p>
        {!loading && <ServerStatusBadge offline={offline} testId="server-detail-status" />}
        <Link className="btn btn-sm btn-ghost" to={`/servers/${server.id}/tools`}>
          <Trans>Server-Werkzeuge</Trans>
        </Link>
        {renaming ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleRename();
            }}
          >
            <input
              className="input input-bordered input-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              aria-label={t`Servername`}
              placeholder={t`Neuer Servername`}
              data-testid="server-rename-input"
            />
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={renameBusy || renameValue.trim() === ""}
              data-testid="server-rename-save"
            >
              <Trans>Speichern</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={renameBusy}
              onClick={() => {
                setRenaming(false);
                setRenameError(null);
              }}
              data-testid="server-rename-cancel"
            >
              <Trans>Abbrechen</Trans>
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setRenameValue(server.name);
              setRenameError(null);
              setRenaming(true);
            }}
            data-testid="server-rename-button"
          >
            <Trans>Umbenennen</Trans>
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost text-error"
          onClick={() => setConfirmDeleteServer(true)}
          data-testid="server-delete-button"
        >
          <Trans>Server löschen</Trans>
        </button>
      </div>
      {renameError !== null && (
        <div className="alert alert-error" data-testid="server-rename-error">
          <span>{renameError}</span>
        </div>
      )}
      {loading && <ContentSkeleton cards={4} testId="server-detail-skeleton" />}
      {error !== null && (
        <div className="alert alert-warning" data-testid="offline-alert">
          <span>
            <Trans>Server offline oder nicht erreichbar: {error}</Trans>
          </span>
          <span className="text-xs">
            <Trans>
              Der Server bleibt gespeichert und wird automatisch weiter versucht. Sessions und
              Aktionen sind bis dahin deaktiviert.
            </Trans>
          </span>
        </div>
      )}
      {!loading && (
        <div
          className={
            split
              ? "grid gap-4 lg:grid-cols-3 lg:items-start"
              : "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          }
          data-testid="server-panels"
        >
          <section className="card bg-base-200 shadow" data-testid="projects-card">
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
                    <li key={p.id} data-testid={`project-row-${p.id}`}>
                      <Link
                        to={`/servers/${server.id}/projects/${p.id}`}
                        title={p.id}
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section
            className={split ? "card bg-base-200 shadow lg:order-first lg:col-span-2" : "card bg-base-200 shadow"}
            data-testid="sessions-card"
          >
            <div className="card-body">
              <h2 className="card-title">
                <Icon name="session" /> <Trans>Sessions ({sessionCount})</Trans>
                {offline && <OfflineBadge testId="sessions-offline-badge" />}
              </h2>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="label label-text">
                    <Trans>Suche</Trans>
                  </span>
                  <input
                    className="input input-bordered input-sm"
                    value={search}
                    onChange={(e) => updateParam("search", e.target.value)}
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
                      onChange={(e) => updateParam("agent", e.target.value)}
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
                      onChange={(e) => updateParam("project", e.target.value)}
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
                  {sessionGroups.map((group) => {
                    const groupProject = projects.find((p) => p.id === group.key) ?? null;
                    const groupCount = group.sessions.length;
                    return (
                    <div key={group.key}>
                      <h3 className="text-sm font-semibold opacity-80 mb-1" title={group.key}>
                        {groupProject === null ? (
                          <>{group.label} ({groupCount})</>
                        ) : (
                          <Link
                            className="link"
                            to={`/servers/${server.id}/projects/${groupProject.id}`}
                          >
                            {group.label} ({groupCount})
                          </Link>
                        )}
                      </h3>
                      <ul className="menu gap-1">
                        {group.sessions.map((s) => {
                          const label = s.label;
                          return (
                          <li key={s.id} data-testid={`session-row-${s.id}`}>
                            <div
                              className={`flex items-center gap-1${
                                offline ? " opacity-50 pointer-events-none" : ""
                              }`}
                              aria-disabled={offline}
                            >
                              <Link
                                className="flex-1"
                                to={`/sessions/${s.id}?server=${server.id}`}
                                tabIndex={offline ? -1 : 0}
                                aria-disabled={offline}
                                onClick={() =>
                                  openTab({ serverID: server.id, sessionID: s.id, title: s.label })
                                }
                              >
                                {s.label}
                              </Link>
                              {offline && <OfflineBadge />}
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                disabled={!canInterrupt}
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
                                disabled={!canDeleteSession}
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
                    );
                  })}
                </div>
              )}
              {nextCursor !== null && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => void loadMoreSessions()}
                  disabled={loadingMore || !canLoadMore}
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
                {offline && <OfflineBadge />}
              </h2>
              <form className="flex gap-2" onSubmit={(e) => void handleCreateShell(e)}>
                <input
                  className="input input-bordered input-sm flex-1"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  placeholder={t`Befehl starten, z. B. sleep 60`}
                  aria-label={t`Neuer Shell-Befehl`}
                  disabled={!canCreateShell}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={creating || newCommand.trim() === "" || !canCreateShell}
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
              {shells.length === 0 ? (
                <p className="opacity-70 text-sm">
                  <Trans>Keine Shells.</Trans>
                </p>
              ) : (
                <ul className="menu gap-1">
                  {shells.map((s) => (
                    <ShellRow
                      key={s.id}
                      server={activeServer}
                      shell={s}
                      expanded={expandedShell === s.id}
                      offline={offline}
                      onToggle={() => toggleShellOutput(s.id)}
                      onRequestRemove={(id, label) => {
                        setKillError(null);
                        setKillTarget({ kind: "shell-remove", id, label });
                      }}
                    />
                  ))}
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
                  Hinweis: Der Terminal-Bildschirm einer Session steht lesend in der
                  Session-Ansicht. Ein Connect-Token kann pro PTY angefordert werden (für
                  externe Terminal-Clients).
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
                            disabled={!canPtyToken}
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
      <ConfirmDialog
        open={confirmDeleteServer}
        title={t`Server löschen`}
        message={t`Der Server „${serverName}“ wird aus dieser App entfernt. Dabei werden nur die lokal gespeicherten Daten (Eintrag und Passwort) gelöscht – der Server selbst bleibt unverändert. Fortfahren?`}
        confirmLabel={t`Entfernen`}
        busy={false}
        error={null}
        onConfirm={handleDeleteServer}
        onCancel={() => setConfirmDeleteServer(false)}
      />
      <ConfirmDialog
        open={projectRename !== null}
        title={t`Projekt umbenennen`}
        message={
          projectRename === null
            ? ""
            : t`Dieser Server hat genau ein Projekt: „${projectRenameName}“. Soll dieses Projekt auf dem Server in „${projectRenameNewName}“ umbenannt werden? Der Servername wurde bereits lokal gespeichert.`
        }
        confirmLabel={t`Umbenennen`}
        busy={projectRenameBusy}
        error={projectRenameError}
        onConfirm={() => void confirmProjectRename()}
        onCancel={() => {
          if (!projectRenameBusy) {
            setProjectRename(null);
            setProjectRenameError(null);
          }
        }}
      />
    </div>
  );
}
