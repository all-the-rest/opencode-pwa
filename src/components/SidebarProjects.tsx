import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import ServerDot from "./ServerDot.tsx";
import { ProjectDot } from "./ProjectTree.tsx";
import { useLiveRefresh, LIVE_REFRESH_INTERVAL_MS } from "../hooks/useLiveRefresh.ts";
import { useProjectsWithSessions } from "../hooks/useProjectsWithSessions.ts";
import { useShowEmptyProjects } from "../hooks/useShowEmptyProjects.ts";
import {
  listProjects,
  listSessionsPaged,
  type ProjectInfo,
  type ServerConfig,
  type SessionRow,
} from "../lib/opencode.ts";
import {
  filterProjectsBySessions,
  projectIconColor,
  projectTreeLabel,
} from "../lib/projectTree.ts";
import { useServers } from "../state/servers.tsx";

const SIDEBAR_SESSION_LIMIT = 15;

/**
 * Projects-first sidebar navigation: projects of the selected server on top
 * (each linking to its own project page), newest sessions below as the
 * session picker. Rendered inside the drawer `nav` in `Layout`, so it serves
 * both mobile (drawer) and desktop (fixed sidebar) — on mobile the projects
 * sit above the sessions, on desktop they sit next to the main content.
 *
 * Offline-tolerant: a failed fetch only renders an offline note; open tabs
 * (localStorage) keep working through the tab bar above the content.
 *
 * The project rows follow the SAME "leere Projekte" filter as the server page
 * (see {@link useShowEmptyProjects}): one persisted flag, so the sidebar can
 * never list a project the server page hides. The toggle itself stays on the
 * server page — the sidebar only reads the flag, it renders no control.
 */
export default function SidebarProjects() {
  const { selectedServer } = useServers();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [showEmptyProjects] = useShowEmptyProjects();

  const reload = useCallback(() => {
    if (selectedServer === null) return;
    const active: ServerConfig = selectedServer;
    void Promise.all([
      listProjects(active),
      listSessionsPaged(active, { limit: SIDEBAR_SESSION_LIMIT }),
    ]).then(([projectsRes, sessionsRes]) => {
      if (projectsRes.error !== null || sessionsRes.error !== null) {
        // Failed refresh: the rows already on screen stay (stale, exactly like
        // the server page keeps its rows), so the filter keeps using them.
        setFailed(true);
        return;
      }
      if (projectsRes.data !== null) setProjects(projectsRes.data);
      if (sessionsRes.data !== null) setSessions(sessionsRes.data.rows);
      setFailed(false);
    });
  }, [selectedServer]);

  useEffect(() => {
    if (selectedServer === null) {
      setProjects([]);
      setSessions([]);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const active: ServerConfig = selectedServer;
    void Promise.all([
      listProjects(active),
      listSessionsPaged(active, { limit: SIDEBAR_SESSION_LIMIT }),
    ]).then(([projectsRes, sessionsRes]) => {
      if (cancelled) return;
      if (projectsRes.error !== null || sessionsRes.error !== null) {
        // A server that never answered leaves both lists unknown: the note
        // below stands in for the rows. The projects filter reads the probe
        // (which fails open) instead of guessing from no rows at all.
        setFailed(true);
        return;
      }
      if (projectsRes.data !== null) setProjects(projectsRes.data);
      if (sessionsRes.data !== null) setSessions(sessionsRes.data.rows);
      setFailed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedServer]);

  useLiveRefresh(selectedServer, reload, LIVE_REFRESH_INTERVAL_MS);

  // "Has sessions" comes from the SHARED probe (`useProjectsWithSessions`): the
  // same wide row set the server page's projects card reads, one request per
  // server instead of one rule per page size. The rows below are the sidebar's
  // own 15 newest and deliberately do NOT feed the filter — a project whose
  // only sessions are older than those 15 was hidden here while it stayed
  // visible on the server page.
  //
  // Fail open, same rule the probe applies: while it is in flight or failed
  // (`loaded` false) every project stays visible, so the list never flashes
  // away on load.
  const sessionProbe = useProjectsWithSessions(selectedServer);
  const visibleProjects = useMemo(
    () =>
      filterProjectsBySessions(projects, {
        sessionProjectIDs: sessionProbe.sessionProjectIDs,
        hideEmptyProjects: !showEmptyProjects && sessionProbe.loaded,
      }),
    [projects, sessionProbe.sessionProjectIDs, sessionProbe.loaded, showEmptyProjects],
  );

  if (selectedServer === null) return null;
  const serverID = selectedServer.id;

  return (
    <>
      <li className="menu-title mt-4">
        <span>
          <Trans>Projekte</Trans>
        </span>
      </li>
      {failed && (
        <li className="text-sm opacity-70 px-4" data-testid="sidebar-projects-offline">
          <Trans>Offline – Projekte nicht ladbar</Trans>
        </li>
      )}
      {!failed && projects.length === 0 && (
        <li className="text-sm opacity-70 px-4">
          <Trans>Keine Projekte.</Trans>
        </li>
      )}
      {/* Filtered rows: same rule as the server page's projects card. No empty
          note here — the card carries the wording and the toggle, the sidebar
          stays compact. */}
      {!failed &&
        visibleProjects.map((p) => (
          <li key={p.id}>
            <NavLink
              to={`/servers/${serverID}/projects/${p.id}`}
              data-testid={`sidebar-project-${p.id}`}
              title={p.canonical ?? p.id}
            >
              <ServerDot server={selectedServer} />
              <ProjectDot color={projectIconColor(p)} testId={`sidebar-project-dot-${p.id}`} />
              {projectTreeLabel(p)}
            </NavLink>
          </li>
        ))}
      <li className="menu-title mt-4">
        <span>
          <Trans>Neueste Sessions</Trans>
        </span>
      </li>
      {failed && (
        <li className="text-sm opacity-70 px-4">
          <Trans>Offline – Sessions nicht ladbar</Trans>
        </li>
      )}
      {!failed && sessions.length === 0 && (
        <li className="text-sm opacity-70 px-4">
          <Trans>Keine Sessions.</Trans>
        </li>
      )}
      {!failed &&
        sessions.map((s) => (
          <li key={s.id}>
            <NavLink
              to={`/sessions/${s.id}?server=${serverID}`}
              data-testid={`sidebar-session-${s.id}`}
            >
              {s.label}
            </NavLink>
          </li>
        ))}
    </>
  );
}
