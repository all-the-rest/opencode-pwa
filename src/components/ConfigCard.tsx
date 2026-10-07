import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import Icon from "./Icon.tsx";
import { isActionEnabled } from "../lib/offline.ts";
import {
  getConfig,
  listConfigShells,
  type ConfigEntryRow,
  type ConfigShellRow,
  type ServerConfig,
} from "../lib/opencode.ts";

interface ConfigCardProps {
  server: ServerConfig;
  offline: boolean;
}

/**
 * Read-only config viewer: effective config documents plus the shells the
 * server accepts. Global-config writes (`PATCH /api/experimental/config`)
 * are deliberately absent — see `features/05-parity.md`.
 */
export default function ConfigCard({ server, offline }: ConfigCardProps) {
  const [entries, setEntries] = useState<ConfigEntryRow[]>([]);
  const [shells, setShells] = useState<ConfigShellRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canView = isActionEnabled(offline, "config-view");
  const canShells = isActionEnabled(offline, "config-shells");

  useEffect(() => {
    if (!canView && !canShells) return;
    let cancelled = false;
    setError(null);
    setEntries([]);
    setShells([]);
    void Promise.all([
      canView ? getConfig(server) : Promise.resolve({ data: [], error: null }),
      canShells ? listConfigShells(server) : Promise.resolve({ data: [], error: null }),
    ]).then(([configRes, shellsRes]) => {
      if (cancelled) return;
      const firstError = configRes.error ?? shellsRes.error;
      if (firstError !== null) {
        setError(firstError);
        return;
      }
      setEntries(configRes.data ?? []);
      setShells(shellsRes.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [server, canView, canShells]);

  return (
    <section className="card bg-base-200 shadow" data-testid="config-card">
      <div className="card-body">
        <h2 className="card-title">
          <Icon name="file" /> <Trans>Konfiguration</Trans>
        </h2>
        <p className="text-xs opacity-70">
          <Trans>
            Nur lesend: wirksame Konfiguration des Servers. Schreiben ist bewusst nicht
            implementiert – die globale Konfiguration bleibt dem Server überlassen.
          </Trans>
        </p>
        {error !== null ? (
          <div className="alert alert-warning">
            <span>{error}</span>
          </div>
        ) : !canView ? (
          <p className="opacity-70 text-sm">
            <Trans>Server offline – Konfiguration ist deaktiviert.</Trans>
          </p>
        ) : entries.length === 0 ? (
          <p className="opacity-70 text-sm">
            <Trans>Keine Konfiguration.</Trans>
          </p>
        ) : (
          <ul className="menu gap-1" data-testid="config-list">
            {entries.map((entry, index) => (
              <li key={`${entry.path ?? "standard"}-${index}`} data-testid={`config-row-${index}`}>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm break-all">
                    {entry.path ?? t`Standard`}
                  </span>
                  <span className="text-xs opacity-70 break-all">
                    {[
                      entry.shell !== null ? `${t`Shell`}: ${entry.shell}` : null,
                      entry.model !== null ? `${t`Modell`}: ${entry.model}` : null,
                      entry.defaultAgent !== null ? `${t`Agent`}: ${entry.defaultAgent}` : null,
                      entry.update !== null ? `${t`Update`}: ${entry.update}` : null,
                      entry.share !== null ? `${t`Teilen`}: ${entry.share}` : null,
                    ]
                      .filter((part): part is string => part !== null)
                      .join(" · ") || t`Keine Angaben`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="text-sm font-semibold">
          <Trans>Verfügbare Shells</Trans>
        </h3>
        {!canShells ? (
          <p className="opacity-70 text-sm">
            <Trans>Server offline – Shell-Liste ist deaktiviert.</Trans>
          </p>
        ) : shells.length === 0 ? (
          <p className="opacity-70 text-sm">
            <Trans>Keine Shells.</Trans>
          </p>
        ) : (
          <ul className="menu gap-1" data-testid="config-shell-list">
            {shells.map((shell) => (
              <li key={shell.path} data-testid={`config-shell-${shell.path}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={shell.acceptable ? "badge badge-success badge-sm" : "badge badge-sm"}
                  >
                    {shell.acceptable ? <Trans>geeignet</Trans> : <Trans>ungeeignet</Trans>}
                  </span>
                  <span className="flex-1 break-all font-mono text-sm">{shell.path}</span>
                  {shell.name !== shell.path && (
                    <span className="text-xs opacity-70">{shell.name}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
