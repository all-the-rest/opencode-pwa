import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import Icon from "./Icon.tsx";
import ServerDot from "./ServerDot.tsx";
import SessionTabBar from "./SessionTabBar.tsx";
import SidebarProjects from "./SidebarProjects.tsx";
import Toasts from "./Toasts.tsx";
import { useEventNotifications } from "../hooks/useEventNotifications.ts";
import { useLayoutMode } from "../state/layoutMode.tsx";
import { useServers } from "../state/servers.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";

export const GITHUB_URL = "https://github.com/all-the-rest/opencode-pwa";

function navClass(isActive: boolean): string {
  return isActive ? "menu-active" : "";
}

export default function Layout() {
  const { servers, selectedServer, selectServer } = useServers();
  const { pruneTabs } = useSessionTabs();
  const { split, toggleMode } = useLayoutMode();
  // Controlled drawer: on mobile the drawer overlays the content and must
  // close once navigation happened — otherwise it keeps covering the page.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEventNotifications(selectedServer);

  // Tabs of removed servers have no target left — drop them.
  useEffect(() => {
    pruneTabs(servers.map((s) => s.id));
  }, [servers, pruneTabs]);

  // Close the mobile drawer after every navigation (no-op on `lg+`, where the
  // sidebar stays open by CSS).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="drawer min-h-screen lg:drawer-open">
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={drawerOpen}
        onChange={(e) => setDrawerOpen(e.target.checked)}
      />
      <div className="drawer-content flex flex-col">
        <header className="navbar bg-base-200 sticky top-0 z-10">
          <div className="flex-none lg:hidden">
            <label htmlFor="app-drawer" className="btn btn-square btn-ghost" aria-label={t`Menü öffnen`}>
              <Icon name="menu" className="h-5 w-5" />
            </label>
          </div>
          <div className="flex-1">
            <Link to="/" className="btn btn-ghost text-xl">
              Web PWA for Opencode
            </Link>
          </div>
          <div className="flex-none flex items-center gap-1">
            <button
              type="button"
              className={`btn btn-square btn-ghost hidden lg:inline-flex ${split ? "btn-active" : ""}`}
              aria-pressed={split}
              aria-label={t`Geteilte Ansicht`}
              title={t`Geteilte Ansicht: Bereiche nebeneinander oder untereinander`}
              data-testid="layout-mode-toggle"
              onClick={toggleMode}
            >
              <Icon name="columns" className="h-5 w-5" />
            </button>
            <a
              className="btn btn-square btn-ghost"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={t`GitHub-Repository öffnen`}
              title={t`GitHub-Repository`}
            >
              <Icon name="github" className="h-5 w-5" />
            </a>
            <select
              className="select select-bordered select-sm max-w-44"
              aria-label={t`Server wählen`}
              title={selectedServer?.name ?? t`Server wählen`}
              value={selectedServer?.id ?? ""}
              onChange={(e) => selectServer(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">
                <Trans>Kein Server</Trans>
              </option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <SessionTabBar />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
        <Toasts />
        <footer className="footer footer-center p-4 bg-base-200 text-sm opacity-80">
          <aside>
            <p>
              <Trans>
                Web PWA for Opencode ·{" "}
                <a className="link" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub-Repository
                </a>
              </Trans>
            </p>
          </aside>
        </footer>
      </div>
      <aside className="drawer-side">
        <label htmlFor="app-drawer" className="drawer-overlay" aria-label={t`Menü schließen`} />
        <nav className="menu bg-base-200 min-h-full w-64 gap-1 p-4" aria-label={t`Hauptnavigation`}>
          <div className="flex justify-end lg:hidden">
            <button
              type="button"
              className="btn btn-square btn-ghost btn-sm"
              aria-label={t`Menü schließen`}
              data-testid="drawer-close"
              onClick={() => setDrawerOpen(false)}
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
          <li>
            <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
              <Trans>Übersicht</Trans>
            </NavLink>
          </li>
          <li>
            <NavLink
              to={selectedServer ? `/servers/${selectedServer.id}` : "/"}
              className={({ isActive }) => navClass(isActive)}
            >
              <Trans>Serverdetails</Trans>
            </NavLink>
          </li>
          <li>
            <NavLink
              to={selectedServer ? `/servers/${selectedServer.id}/tools` : "/"}
              className={({ isActive }) => navClass(isActive)}
            >
              <Trans>Server-Werkzeuge</Trans>
            </NavLink>
          </li>
          <li>
            <NavLink to="/agents" className={({ isActive }) => navClass(isActive)}>
              <Trans>Agenten</Trans>
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
              <Trans>Einstellungen</Trans>
            </NavLink>
          </li>
          <SidebarProjects />
          <li className="menu-title mt-4">
            <span>
              <Trans>Server</Trans>
            </span>
          </li>
          {servers.length === 0 && (
            <li className="text-sm opacity-70 px-4">
              <Trans>Noch keine Server angelegt.</Trans>
            </li>
          )}
          {servers.map((s) => (
            <li key={s.id}>
              <NavLink
                to={`/servers/${s.id}`}
                className={({ isActive }) => navClass(isActive)}
              >
                <ServerDot server={s} />
                {s.name}
              </NavLink>
            </li>
          ))}
        </nav>
      </aside>
    </div>
  );
}
