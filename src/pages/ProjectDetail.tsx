import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.tsx";
import ServerDot from "../components/ServerDot.tsx";
import ServerErrorBanner from "../components/ServerErrorBanner.tsx";
import ServerStatusBadge from "../components/ServerStatusBadge.tsx";
import { useLiveRefresh, LIVE_REFRESH_INTERVAL_MS } from "../hooks/useLiveRefresh.ts";
import { isActionEnabled, reachability } from "../lib/offline.ts";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const agentFilter = searchParams.get("agent") ?? "";

  const server = servers.find((s) => s.id === serverId) ?? null;
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
  const projectName = project?.name ?? projectId ?? "";
  // Lingui-safe hoists: no member access inside messages.
  const serverName = activeServer.name;
  const agents = [...new Set(sessions.map((s) => s.agent).filter((a): a is string => a !== null))].sort();
  const filtered = filterSessionRows(sessions, {
    agent: agentFilter === "" ? null : agentFilter,
    search,
  });
  const sessionCount = filtered.length;
  const { offline } = reachability(error);
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
      <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="project-title">
        <ServerDot server={activeServer} />
        <Icon name="project" />
        {projectName === "" ? <Trans>Projekt</Trans> : projectName}
      </h1>
      <p className="text-sm opacity-70">
        <Trans>Server: {serverName}</Trans> {!loading && <ServerStatusBadge offline={offline} />}
      </p>
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
            <label className="flex flex-col gap-1 flex-1">
              <span className="label label-text">
                <Trans>Suche</Trans>
              </span>
              <input
                className="input input-bordered input-sm"
                value={search}
                onChange={(e) => updateParam("search", e.target.value)}
                placeholder={t`Titel oder ID suchen`}
                aria-label={t`Sessions suchen`}
                data-testid="project-search"
              />
            </label>
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
          {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
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
                      className="flex-1"
                      to={`/sessions/${s.id}?server=${activeServer.id}`}
                      tabIndex={offline ? -1 : 0}
                      aria-disabled={offline}
                      onClick={() =>
                        openTab({ serverID: activeServer.id, sessionID: s.id, title: s.label })
                      }
                    >
                      {s.label}
                    </Link>
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
