import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.tsx";
import ProjectRenameForm from "../components/ProjectRenameForm.tsx";
import { ProjectDot } from "../components/ProjectTree.tsx";
import ServerDot from "../components/ServerDot.tsx";
import ServerErrorBanner from "../components/ServerErrorBanner.tsx";
import ServerStatusBadge from "../components/ServerStatusBadge.tsx";
import { useLiveRefresh, LIVE_REFRESH_INTERVAL_MS } from "../hooks/useLiveRefresh.ts";
import { useActiveSessionID } from "../hooks/useActiveSessionID.ts";
import { useOpenSessionTabs, useSessionUnread } from "../hooks/useSessionSearch.ts";
import { useProjectRename } from "../hooks/useProjectRename.ts";
import { useProjectSync } from "../hooks/useProjectSync.ts";
import SessionListSkeleton from "../components/SessionListSkeleton.tsx";
import SessionRowMarkers from "../components/SessionRowMarkers.tsx";
import SessionSearchOverlay from "../components/SessionSearchOverlay.tsx";
import { isActionEnabled, reachability } from "../lib/offline.ts";
import { projectIconColor, projectTreeLabel } from "../lib/projectTree.ts";
import {
  filterSessionRows,
  listProjects,
  listSessionsPaged,
  type ProjectInfo,
  type ServerConfig,
  type SessionRow,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";

const SESSION_PAGE_LIMIT = 50;

/**
 * One project as its own page (`/servers/:serverId/projects/:projectId`).
 * Navigation rule: every page gets a clean SPA route; view state
 * (search/agent filter) lives in query params, so the URL stays shareable
 * and deep-linkable. Sessions open in the always-visible tab bar
 * (`?server=` pattern, same as everywhere else).
 *
 * Offline: the server stays visible with an offline badge; session rows stay
 * visible but disabled, and no action is offered.
 */
export default function ProjectDetail() {
  const { serverId, projectId } = useParams<{ serverId: string; projectId: string }>();
  const { servers } = useServers();
  const { openTab } = useSessionTabs();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const agentFilter = searchParams.get("agent") ?? "";

  const server = servers.find((s) => s.id === serverId) ?? null;
  // Wave 5: the open session of the tab bar clears its unread dot in the list.
  const activeSessionID = useActiveSessionID();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (server === null) return;
    const active: ServerConfig = server;
    const activeProject: string | undefined = projectId;
    void Promise.all([
      listSessionsPaged(
        active,
        activeProject === undefined ? { limit: SESSION_PAGE_LIMIT } : { limit: SESSION_PAGE_LIMIT, project: activeProject },
      ),
      listProjects(active),
    ]).then(([sessionsRes, projectsRes]) => {
      const firstError = sessionsRes.error ?? projectsRes.error;
      if (firstError !== null) {
        setError(firstError);
        return;
      }
      if (sessionsRes.data !== null) {
        // Server-side project filter is best-effort (older servers may
        // ignore it) — always filter client-side as well.
        const rows = projectId === undefined
          ? sessionsRes.data.rows
          : sessionsRes.data.rows.filter((row) => row.projectKey === projectId);
        setSessions(rows);
        setNextCursor(sessionsRes.data.cursor.next);
      }
      if (projectsRes.data !== null) setProjects(projectsRes.data);
      setError(null);
    });
  }, [server, projectId]);

  useEffect(() => {
    if (server === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSessions([]);
    setNextCursor(null);
    const active: ServerConfig = server;
    const activeProject: string | undefined = projectId;
    void Promise.all([
      listSessionsPaged(
        active,
        activeProject === undefined ? { limit: SESSION_PAGE_LIMIT } : { limit: SESSION_PAGE_LIMIT, project: activeProject },
      ),
      listProjects(active),
    ])
      .then(([sessionsRes, projectsRes]) => {
        if (cancelled) return;
        const firstError = sessionsRes.error ?? projectsRes.error;
        if (firstError !== null) {
          setError(firstError);
          setSessions([]);
          setProjects([]);
          return;
        }
        if (sessionsRes.data !== null) {
          const rows = projectId === undefined
            ? sessionsRes.data.rows
            : sessionsRes.data.rows.filter((row) => row.projectKey === projectId);
          setSessions(rows);
          setNextCursor(sessionsRes.data.cursor.next);
        }
        if (projectsRes.data !== null) setProjects(projectsRes.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [server, projectId]);

  useLiveRefresh(server, reload, LIVE_REFRESH_INTERVAL_MS);

  // Wave 7: `project.updated` patches the list live (the event carries the full
  // project) and a rename optimistically updates the header with rollback + toast.
  useProjectSync(server, setProjects);
  const renameProject = useProjectRename(server, setProjects);
  const [renaming, setRenaming] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  // Switching projects (sidebar link) closes the open rename form — the form
  // always belongs to exactly one project.
  useEffect(() => {
    setRenaming(false);
  }, [projectId]);

  // Wave 5: open-tab badge + unread dot per session row — from state the page
  // already has (`useSessionTabs`, the event hub's derived run state). Called
  // before the early return below so the hook order stays stable.
  const openTabs = useOpenSessionTabs();
  const listedSessionIDs = useMemo(() => sessions.map((row) => row.id), [sessions]);
  const unread = useSessionUnread(server, listedSessionIDs, activeSessionID);

  function updateParam(key: "search" | "agent", value: string) {
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

  if (server === null) {
    return (
      <div className="flex flex-col gap-4" data-testid="project-detail">
        <h1 className="text-2xl font-bold">
          <Trans>Server nicht gefunden</Trans>
        </h1>
        <Link className="btn btn-primary w-fit" to="/">
          <Trans>Zurück zur Übersicht</Trans>
        </Link>
      </div>
    );
  }

  const activeServer: ServerConfig = server;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const projectName = project === null ? projectId ?? "" : projectTreeLabel(project);
  // Lingui-safe hoists: no member access inside messages.
  const serverName = activeServer.name;
  const { offline } = reachability(error);
  const canRenameProject = isActionEnabled(offline, "project-rename");

  async function handleProjectRename(patch: { name: string; color?: string | null }) {
    if (project === null || !canRenameProject) return;
    setRenameBusy(true);
    try {
      const saved = await renameProject(project, patch);
      if (saved) setRenaming(false);
    } finally {
      setRenameBusy(false);
    }
  }
  const agents = [...new Set(sessions.map((s) => s.agent).filter((a): a is string => a !== null))].sort();
  const filtered = filterSessionRows(sessions, {
    agent: agentFilter === "" ? null : agentFilter,
    search,
  });
  const sessionCount = filtered.length;
  const canLoadMore = isActionEnabled(offline, "sessions-load-more");

  async function loadMoreSessions() {
    if (nextCursor === null || loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    const result = await listSessionsPaged(activeServer, {
      limit: SESSION_PAGE_LIMIT,
      cursor: nextCursor,
      ...(projectId === undefined ? {} : { project: projectId }),
    });
    setLoadingMore(false);
    if (result.error !== null || result.data === null) {
      setError(result.error ?? t`Sessions konnten nicht nachgeladen werden.`);
      return;
    }
    const known = new Set(sessions.map((s) => s.id));
    const rows = projectId === undefined
      ? result.data.rows
      : result.data.rows.filter((row) => row.projectKey === projectId);
    setSessions((prev) => [...prev, ...rows.filter((r) => !known.has(r.id))]);
    setNextCursor(result.data.cursor.next);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="project-detail">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="btn btn-sm btn-ghost"
          to={`/servers/${activeServer.id}`}
          data-testid="project-back"
        >
          <Trans>← Server</Trans>
        </Link>
      </div>
      <div className="flex flex-col gap-1">
        <h1
          className="text-2xl font-bold flex items-center gap-2 flex-wrap"
          data-testid="project-title"
        >
          <ServerDot server={activeServer} />
          <Icon name="project" />
          {project !== null && (
            <ProjectDot color={projectIconColor(project)} testId="project-dot" />
          )}
          {projectName === "" ? <Trans>Projekt</Trans> : projectName}
        </h1>
        {project?.canonical !== undefined && (
          <p
            className="text-sm opacity-70 font-mono break-all"
            data-testid="project-canonical"
          >
            {project.canonical}
          </p>
        )}
        <p className="text-sm opacity-70 flex flex-wrap items-center gap-2">
          <Trans>Server: {serverName}</Trans> {!loading && <ServerStatusBadge offline={offline} />}
          {project !== null && !renaming && (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              disabled={!canRenameProject}
              title={t`Anzeigename und Farbe des Projekts ändern`}
              data-testid="project-rename-button"
              onClick={() => setRenaming(true)}
            >
              <Icon name="edit" />
              <Trans>Umbenennen</Trans>
            </button>
          )}
        </p>
        {project !== null && renaming && (
          <ProjectRenameForm
            key={project.id}
            initialName={project.name}
            initialColor={projectIconColor(project)}
            busy={renameBusy}
            onSubmit={(patch) => void handleProjectRename(patch)}
            onCancel={() => setRenaming(false)}
          />
        )}
      </div>
      {projectId !== undefined && project === null && !loading && error === null && (
        <div className="alert alert-warning">
          <span>
            <Trans>Dieses Projekt ist auf dem Server unbekannt – eventuell wurde es gelöscht.</Trans>
          </span>
        </div>
      )}
      {error !== null && (
        <ServerErrorBanner error={error} serverId={server?.id} testId="offline-alert">
          <span className="text-xs">
            <Trans>
              Der Server bleibt gespeichert und wird automatisch weiter versucht. Sessions sind
              bis dahin deaktiviert.
            </Trans>
          </span>
        </ServerErrorBanner>
      )}
      <section className="card bg-base-200 shadow" data-testid="project-sessions-card">
        <div className="card-body">
          <h2 className="card-title">
            <Icon name="session" /> <Trans>Sessions ({sessionCount})</Trans>
            {offline && (
              <span className="badge badge-warning gap-1" data-testid="project-offline-badge">
                <Trans>Offline</Trans>
              </span>
            )}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Wave 5: server-side search overlay with keyboard navigation; the
                query stays in `?search=` (shareable, deep-linkable). */}
            <SessionSearchOverlay
              server={activeServer}
              project={projectId ?? null}
              value={search}
              onValueChange={(value) => updateParam("search", value)}
              onOpenSession={(sessionID) => {
                openTab({ serverID: activeServer.id, sessionID, title: sessionID });
                navigate(
                  `/sessions/${encodeURIComponent(sessionID)}?server=${encodeURIComponent(activeServer.id)}`,
                );
              }}
              disabled={offline}
              testId="project-session-search"
              inputTestId="project-search"
            />
            <label className="flex flex-col gap-1 flex-1">
              <span className="label label-text">
                <Trans>Agent</Trans>
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={agentFilter}
                onChange={(e) => updateParam("agent", e.target.value)}
                aria-label={t`Nach Agent filtern`}
                data-testid="project-agent-filter"
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
          </div>
          {loading && <SessionListSkeleton testId="project-sessions-skeleton" />}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col gap-2" data-testid="project-sessions-empty">
              <p className="opacity-70 text-sm">
                {sessions.length === 0 ? (
                  <Trans>Keine Sessions in diesem Projekt.</Trans>
                ) : (
                  <Trans>Keine Sessions für diese Suche oder Filter.</Trans>
                )}
              </p>
              {sessions.length === 0 && (
                <div className="card-actions">
                  <Link
                    className="btn btn-primary btn-sm"
                    to="/"
                    data-testid="project-sessions-empty-cta"
                  >
                    <Trans>Session starten</Trans>
                  </Link>
                </div>
              )}
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <ul className="menu gap-1">
              {filtered.map((s) => (
                <li key={s.id} data-testid={`project-session-row-${s.id}`}>
                  <div
                    className={`flex items-center gap-1${offline ? " opacity-50 pointer-events-none" : ""}`}
                    aria-disabled={offline}
                  >
                    <Link
                      className="flex-1 min-w-0"
                      to={`/sessions/${s.id}?server=${activeServer.id}`}
                      tabIndex={offline ? -1 : 0}
                      aria-disabled={offline}
                      onClick={() =>
                        openTab({ serverID: activeServer.id, sessionID: s.id, title: s.label })
                      }
                    >
                      <span className="truncate">{s.label}</span>
                    </Link>
                    <SessionRowMarkers
                      open={openTabs.has(s.id)}
                      unread={unread.has(s.id)}
                    />
                    {offline && (
                      <span className="badge badge-warning gap-1">
                        <Trans>Offline</Trans>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
    </div>
  );
}
