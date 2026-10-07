import { t } from "@lingui/core/macro";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { serverColor } from "../lib/serverColor.ts";
import { useServers } from "../state/servers.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";

/**
 * Tab bar for open sessions from different servers side by side. Each tab
 * binds serverID+sessionID; the label is the session title plus a dot in the
 * server color. Horizontally scrollable (mobile-first). Rendered above the
 * page content in `Layout`; pure localStorage state, so it renders the cached
 * tab list even while every server is offline.
 */
export default function SessionTabBar() {
  const { tabs, closeTab } = useSessionTabs();
  const { servers } = useServers();
  const location = useLocation();
  const navigate = useNavigate();

  if (tabs.length === 0) return null;

  const sessionMatch = location.pathname.match(/^\/sessions\/([^/]+)$/);
  const activeSessionID = sessionMatch?.[1] !== undefined
    ? decodeURIComponent(sessionMatch[1])
    : null;
  const activeServerID = new URLSearchParams(location.search).get("server");

  function isActiveTab(serverID: string, sessionID: string): boolean {
    if (activeSessionID === null || sessionID !== activeSessionID) return false;
    if (activeServerID !== null) return serverID === activeServerID;
    return true;
  }

  function handleClose(serverID: string, sessionID: string) {
    const index = tabs.findIndex((tab) => tab.serverID === serverID && tab.sessionID === sessionID);
    const closingActive = isActiveTab(serverID, sessionID);
    closeTab(serverID, sessionID);
    if (!closingActive) return;
    // Back to the previous tab, else the next one, else the dashboard.
    const next = tabs[index - 1] ?? tabs[index + 1] ?? null;
    if (next === null) {
      navigate("/");
      return;
    }
    navigate(`/sessions/${encodeURIComponent(next.sessionID)}?server=${encodeURIComponent(next.serverID)}`);
  }

  const serverById = new Map(servers.map((s) => [s.id, s]));

  return (
    <nav aria-label={t`Offene Sessions`} className="overflow-x-auto border-b border-base-300">
      <ul className="flex gap-1 px-4 pt-2" role="tablist" data-testid="session-tab-bar">
        {tabs.map((tab) => {
          const active = isActiveTab(tab.serverID, tab.sessionID);
          const server = serverById.get(tab.serverID);
          const color = server !== undefined ? serverColor(server) : undefined;
          // Lingui-safe hoist: no member access inside the message.
          const tabTitle = tab.title;
          const closeLabel = t`Tab ${tabTitle} schließen`;
          return (
            <li key={`${tab.serverID}::${tab.sessionID}`} role="presentation" className="shrink-0">
              <div
                role="tab"
                aria-selected={active}
                data-testid={`session-tab-${tab.sessionID}`}
                className={`flex max-w-56 items-center gap-1.5 rounded-t-lg border border-b-0 px-2 py-1.5 text-sm ${
                  active ? "border-base-300 bg-base-200 font-semibold" : "border-transparent opacity-70 hover:opacity-100"
                }`}
                style={active && color !== undefined ? { borderTop: `2px solid ${color}` } : undefined}
              >
                {color !== undefined && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                    data-testid={`session-tab-dot-${tab.sessionID}`}
                  />
                )}
                <Link
                  className="min-w-0 flex-1 truncate"
                  to={`/sessions/${encodeURIComponent(tab.sessionID)}?server=${encodeURIComponent(tab.serverID)}`}
                  title={server !== undefined ? `${tab.title} (${server.name})` : tab.title}
                >
                  {tab.title}
                </Link>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost shrink-0"
                  aria-label={closeLabel}
                  title={t`Schließen`}
                  onClick={() => handleClose(tab.serverID, tab.sessionID)}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
