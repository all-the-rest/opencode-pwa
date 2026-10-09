import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "./Icon.tsx";
import ServerDot from "./ServerDot.tsx";
import ServerErrorBanner from "./ServerErrorBanner.tsx";
import ServerFolderPicker from "./ServerFolderPicker.tsx";
import { useLiveRefresh, LIVE_REFRESH_INTERVAL_MS } from "../hooks/useLiveRefresh.ts";
import { reachability } from "../lib/offline.ts";
import {
  listProjects,
  listSessionsPaged,
  projectDisplayName,
  type ProjectInfo,
  type ServerConfig,
  type SessionInfo,
  type SessionRow,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";

const STARTER_LIMIT = 20;
const STARTER_VISIBLE = 10;

/**
 * Session starter for the home page (`/`): when no tab is open this is the
 * fallback that gets the user into a session — newest sessions of the
 * selected server plus the open tabs when there are any. Pure localStorage
 * tabs render even while every server is offline; the server list only
 * degrades to an offline note.
 */
export default function SessionStarter() {
  const { selectedServer } = useServers();
  const { tabs, openTab } = useSessionTabs();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Wave 7 parity: the folder picker ("Neues Projekt") is reachable from the
  // dashboard starter too, not only from the server detail page.
  const [pickerOpen, setPickerOpen] = useState(false);

  const reload = useCallback(() => {
    if (selectedServer === null) return;
    const active: ServerConfig = selectedServer;
    void Promise.all([
      listSessionsPaged(active, { limit: STARTER_LIMIT }),
      listProjects(active),
    ]).then(([sessionsRes, projectsRes]) => {
      const firstError = sessionsRes.error ?? projectsRes.error;
      if (firstError !== null) {
        setError(firstError);
        return;
      }
      if (sessionsRes.data !== null) setSessions(sessionsRes.data.rows);
      if (projectsRes.data !== null) setProjects(projectsRes.data);
      setError(null);
    });
  }, [selectedServer]);

  useEffect(() => {
    if (selectedServer === null) {
      setSessions([]);
      setProjects([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const active: ServerConfig = selectedServer;
    void Promise.all([
      listSessionsPaged(active, { limit: STARTER_LIMIT }),
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
        if (sessionsRes.data !== null) setSessions(sessionsRes.data.rows);
        if (projectsRes.data !== null) setProjects(projectsRes.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer]);

  useLiveRefresh(selectedServer, reload, LIVE_REFRESH_INTERVAL_MS);

  const { offline } = reachability(error);
  const visible = sessions.slice(0, STARTER_VISIBLE);
  // Lingui-safe hoists: no member access inside messages.
  const selectedServerName = selectedServer?.name ?? "";
  const tabCount = tabs.length;

  /**
   * The folder picker created a session in the chosen directory — that is how
   * a project comes into existence (the server derives it from the session's
   * `location.directory`). Same behaviour as the server detail page: refresh
   * the starter list, open the session in a tab and navigate to it.
   */
  function handlePickerCreated(session: SessionInfo) {
    setPickerOpen(false);
    reload();
    if (selectedServer === null) return;
    openTab({ serverID: selectedServer.id, sessionID: session.id, title: session.id });
    navigate(
      `/sessions/${encodeURIComponent(session.id)}?server=${encodeURIComponent(selectedServer.id)}`,
    );
  }

  return (
    <section className="card bg-base-200 shadow" data-testid="session-starter">
      <div className="card-body">
        <h2 className="card-title flex-wrap">
          <Trans>Session starten</Trans>
          <button
            type="button"
            className="btn btn-xs btn-ghost ml-auto"
            disabled={selectedServer === null}
            title={
              selectedServer === null
                ? t`Kein Server ausgewählt – neues Projekt nicht möglich.`
                : t`Neues Projekt über die Server-Ordner anlegen`
            }
            data-testid="starter-new-project-button"
            onClick={() => setPickerOpen(true)}
          >
            <Icon name="plus" />
            <Trans>Neues Projekt</Trans>
          </button>
        </h2>
        {selectedServer === null && (
          <p className="text-sm opacity-70" data-testid="starter-new-project-hint">
            <Trans>
              Für ein neues Projekt wird ein Server benötigt — wähle oder lege unten einen an.
            </Trans>
          </p>
        )}
        {selectedServer !== null && (
          <p className="text-sm opacity-70 flex items-center gap-2">
            <ServerDot server={selectedServer} />
            <Trans>Neueste Sessions auf {selectedServerName}</Trans>
          </p>
        )}
        {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
        {error !== null && (
          <ServerErrorBanner error={error} serverId={selectedServer?.id} testId="session-starter-offline" />
        )}
        {!loading && error === null && selectedServer !== null && visible.length === 0 && (
          <div className="flex flex-col gap-2" data-testid="session-starter-empty">
            <p className="opacity-70 text-sm">
              <Trans>Keine Sessions auf diesem Server.</Trans>
            </p>
            <div className="card-actions">
              <Link className="btn btn-primary btn-sm" to={`/servers/${selectedServer.id}`}>
                <Trans>Serverdetails öffnen</Trans>
              </Link>
            </div>
          </div>
        )}
        {visible.length > 0 && (
          <ul className="menu gap-1">
            {visible.map((s) => (
              <li key={s.id} data-testid={`session-starter-row-${s.id}`}>
                <Link
                  className={`flex items-center gap-2${offline ? " opacity-50 pointer-events-none" : ""}`}
                  to={`/sessions/${s.id}?server=${selectedServer?.id ?? ""}`}
                  tabIndex={offline ? -1 : 0}
                  aria-disabled={offline}
                  onClick={() =>
                    selectedServer !== null &&
                    openTab({ serverID: selectedServer.id, sessionID: s.id, title: s.label })
                  }
                >
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="text-xs opacity-60 truncate">
                    {projectDisplayName(projects, s.projectKey)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {selectedServer !== null && (
          <div className="card-actions">
            <Link className="btn btn-ghost btn-sm" to={`/servers/${selectedServer.id}`}>
              <Trans>Alle Sessions ansehen</Trans>
            </Link>
          </div>
        )}
        {tabs.length > 0 && (
          <div data-testid="session-starter-open-tabs">
            <h3 className="text-sm font-semibold opacity-80 mt-2">
              <Trans>Offene Tabs ({tabCount})</Trans>
            </h3>
            <ul className="menu gap-1">
              {tabs.map((tab) => (
                <li key={`${tab.serverID}::${tab.sessionID}`}>
                  <Link
                    to={`/sessions/${encodeURIComponent(tab.sessionID)}?server=${encodeURIComponent(tab.serverID)}`}
                  >
                    {tab.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {selectedServer !== null && (
        <ServerFolderPicker
          server={selectedServer}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onCreated={handlePickerCreated}
        />
      )}
    </section>
  );
}
