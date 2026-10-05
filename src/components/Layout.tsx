import { Link, NavLink, Outlet } from "react-router-dom";
import { useServers } from "../state/servers.tsx";

function navClass(isActive: boolean): string {
  return isActive ? "menu-active" : "";
}

export default function Layout() {
  const { servers, selectedServer, selectServer } = useServers();

  return (
    <div className="drawer min-h-screen lg:drawer-open">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col">
        <header className="navbar bg-base-200 sticky top-0 z-10">
          <div className="flex-none lg:hidden">
            <label htmlFor="app-drawer" className="btn btn-square btn-ghost" aria-label="Menü öffnen">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </label>
          </div>
          <div className="flex-1">
            <Link to="/" className="btn btn-ghost text-xl">
              Web PWA for Opencode
            </Link>
          </div>
          <div className="flex-none">
            <select
              className="select select-bordered select-sm max-w-44"
              aria-label="Server wählen"
              value={selectedServer?.id ?? ""}
              onChange={(e) => selectServer(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">Kein Server</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
      <aside className="drawer-side">
        <label htmlFor="app-drawer" className="drawer-overlay" aria-label="Menü schließen" />
        <nav className="menu bg-base-200 min-h-full w-64 gap-1 p-4">
          <li>
            <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
              Übersicht
            </NavLink>
          </li>
          <li>
            <NavLink
              to={selectedServer ? `/servers/${selectedServer.id}` : "/"}
              className={({ isActive }) => navClass(isActive)}
            >
              Serverdetails
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
              Einstellungen
            </NavLink>
          </li>
          <li className="menu-title mt-4">
            <span>Server</span>
          </li>
          {servers.length === 0 && (
            <li className="text-sm opacity-70 px-4">Noch keine Server angelegt.</li>
          )}
          {servers.map((s) => (
            <li key={s.id}>
              <NavLink
                to={`/servers/${s.id}`}
                className={({ isActive }) => navClass(isActive)}
              >
                {s.name}
              </NavLink>
            </li>
          ))}
        </nav>
      </aside>
    </div>
  );
}
