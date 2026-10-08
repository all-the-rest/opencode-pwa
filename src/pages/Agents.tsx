import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ServerDot from "../components/ServerDot.tsx";
import { loadActiveAgents, type ActiveAgentRow } from "../lib/activeAgents.ts";
import { useServers } from "../state/servers.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";

/**
 * "Agenten" overview: every session with a live execution across all
 * configured servers (`GET /api/session/active` per server, joined with the
 * session list). Tapping a row opens the session (its tab registers, so this
 * is the mobile entry point — no side-by-side needed).
 */
export default function Agents() {
  const { servers } = useServers();
  const { openTab } = useSessionTabs();
  const [rows, setRows] = useState<ActiveAgentRow[] | null>(null);
  const [failedServers, setFailedServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const byID = new Map(servers.map((server) => [server.id, server]));
  // Lingui-safe hoist: no calls inside messages.
  const failedNames = failedServers.join(", ");

  useEffect(() => {
    if (servers.length === 0) {
      setRows([]);
      setFailedServers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(servers.map((server) => loadActiveAgents(server))).then((results) => {
      if (cancelled) return;
      setRows(results.flatMap((result) => result.rows));
      setFailedServers(
        servers
          .filter((_, index) => results[index]?.error !== null)
          .map((server) => server.name),
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.map((server) => server.id).join(",")]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        <Trans>Laufende Agenten</Trans>
      </h1>
      {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
      {!loading && failedServers.length > 0 && (
        <div className="alert alert-warning" data-testid="agents-partial-error">
          <span>
            <Trans>Antwortet nicht: {failedNames}</Trans>
          </span>
        </div>
      )}
      {!loading && rows !== null && rows.length === 0 && (
        <div className="flex flex-col gap-2" data-testid="agents-empty-state">
          <p className="opacity-70 text-sm">
            <Trans>Keine laufenden Agenten – keine Session führt gerade aus.</Trans>
          </p>
          <div className="card-actions">
            <Link className="btn btn-primary btn-sm" to="/">
              <Trans>Zur Übersicht</Trans>
            </Link>
          </div>
        </div>
      )}
      {!loading && rows !== null && rows.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="agents-overview">
          {rows.map((row) => {
            const server = byID.get(row.serverID);
            const agentLabel = row.agent ?? t`Unbekannt`;
            const modelLabel = row.model ?? t`Unbekannt`;
            const rowTitle = row.title;
            return (
              <li key={`${row.serverID}/${row.sessionID}`}>
                <Link
                  className="card bg-base-200 shadow hover:bg-base-300"
                  to={`/sessions/${row.sessionID}?server=${row.serverID}`}
                  onClick={() =>
                    openTab({ serverID: row.serverID, sessionID: row.sessionID, title: row.title })
                  }
                  aria-label={t`Session ${rowTitle} öffnen`}
                  data-testid={`agent-row-${row.serverID}-${row.sessionID}`}
                >
                  <div className="card-body py-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {server !== undefined && <ServerDot server={server} />}
                      <span className="font-semibold flex-1 break-all">{row.title}</span>
                      <span className="badge badge-info badge-sm">
                        <Trans>Läuft</Trans>
                      </span>
                    </div>
                    <p className="text-xs opacity-70 font-mono break-all">
                      <Trans>
                        {agentLabel} · {modelLabel}
                      </Trans>
                    </p>
                    {server !== undefined && (
                      <p className="text-xs opacity-70">{server.name}</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
