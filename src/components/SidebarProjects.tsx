import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import ServerDot from "./ServerDot.tsx";
import { ProjectDot } from "./ProjectTree.tsx";
import { useLiveRefresh, LIVE_REFRESH_INTERVAL_MS } from "../hooks/useLiveRefresh.ts";
import {
  listProjects,
  listSessionsPaged,
  type ProjectInfo,
  type ServerConfig,
  type SessionRow,
} from "../lib/opencode.ts";
import { projectIconColor, projectTreeLabel } from "../lib/projectTree.ts";
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
 */
export default function SidebarProjects() {
  const { selectedServer } = useServers();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(() => {
    if (selectedServer === null) return;
    const active: ServerConfig = selectedServer;
    void Promise.all([
      listProjects(active),
      listSessionsPaged(active, { limit: SIDEBAR_SESSION_LIMIT }),
    ]).then(([projectsRes, sessionsRes]) => {
      if (projectsRes.error !== null || sessionsRes.error !== null) {
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
      {!failed &&
        projects.map((p) => (
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
