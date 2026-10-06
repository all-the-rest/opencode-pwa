import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon.tsx";
import { useLiveRefresh } from "../hooks/useLiveRefresh.ts";
import { isActionEnabled, reachability } from "../lib/offline.ts";
import {
  listAgents,
  listFiles,
  listMcpServers,
  listModels,
  listPendingPermissions,
  listProjects,
  listProviders,
  listVcsStatus,
  listWorktrees,
  readFile,
  replyPermission,
  MAX_FILE_PREVIEW_CHARS,
  type AgentOption,
  type FileContent,
  type FileEntryRow,
  type McpServerRow,
  type McpServerState,
  type ModelOption,
  type PermissionRequestRow,
  type ProjectInfo,
  type ProviderRow,
  type VcsChangeKind,
  type VcsStatusRow,
  type WorktreeRow,
} from "../lib/opencode.ts";
import { useServers } from "../state/servers.tsx";

/**
 * Read-only parity view for the remaining server tools: file browser, VCS
 * status, worktrees, MCP servers and pending permissions. Writes are limited
 * to answering a permission request — everything risky stays out (no file
 * write, no worktree create/remove, no MCP config editing).
 */

interface FilePreview {
  path: string;
  content: FileContent;
}

interface Overview {
  vcs: VcsStatusRow[];
  mcp: McpServerRow[];
  permissions: PermissionRequestRow[];
}

const EMPTY_OVERVIEW: Overview = { vcs: [], mcp: [], permissions: [] };

const MCP_LABELS: Record<McpServerState, string> = {
  connected: "verbunden",
  pending: "wartet",
  disabled: "deaktiviert",
  failed: "fehlgeschlagen",
  needs_auth: "Anmeldung nötig",
};

const VCS_LABELS: Record<VcsChangeKind, string> = {
  added: "neu",
  modified: "geändert",
  deleted: "gelöscht",
};

const ACTIVATION_LABELS: Record<string, string> = {
  auto: "automatisch",
  enabled: "aktiviert",
  disabled: "deaktiviert",
};

function vcsBadgeClass(status: VcsChangeKind): string {
  if (status === "added") return "badge badge-success";
  if (status === "deleted") return "badge badge-error";
  return "badge badge-warning";
}

function mcpBadgeClass(status: McpServerState): string {
  if (status === "connected") return "badge badge-success";
  if (status === "failed" || status === "needs_auth") return "badge badge-error";
  if (status === "disabled") return "badge";
  return "badge badge-warning";
}

/** Join a directory and an entry path, keeping the root as "". */
function joinPath(base: string, entry: string): string {
  if (base === "") return entry;
  if (entry === "") return base;
  return `${base.replace(/\/$/, "")}/${entry.replace(/^\//, "")}`;
}

/** Parent of a project-relative path, `null` at the root. */
function parentPath(path: string): string | null {
  if (path === "") return null;
  const cut = path.replace(/\/$/, "").lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function OfflineAlert({ error }: { error: string }) {
  return (
    <div className="alert alert-warning" data-testid="tools-offline-alert">
      <span>
        <Trans>Server offline oder nicht erreichbar: {error}</Trans>
      </span>
    </div>
  );
}

export default function ServerTools() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers } = useServers();
  const server = servers.find((s) => s.id === id) ?? null;

  const [path, setPath] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [files, setFiles] = useState<FileEntryRow[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectId, setProjectId] = useState("");
  const [worktrees, setWorktrees] = useState<WorktreeRow[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const activeServer = server;

  const reloadOverview = useCallback((): Promise<void> => {
    if (activeServer === null) return Promise.resolve();
    return Promise.all([
      listVcsStatus(activeServer),
      listMcpServers(activeServer),
      listPendingPermissions(activeServer),
      listProjects(activeServer),
    ]).then(([vcsRes, mcpRes, permissionRes, projectsRes]) => {
      const firstError = vcsRes.error ?? mcpRes.error ?? permissionRes.error;
      if (firstError !== null) {
        setError(firstError);
        return;
      }
      setOverview({
        vcs: vcsRes.data ?? [],
        mcp: mcpRes.data ?? [],
        permissions: permissionRes.data ?? [],
      });
      const projectList = projectsRes.data ?? [];
      setProjects(projectList);
      setProjectId((current) => {
        if (projectList.some((p) => p.id === current)) return current;
        return projectList[0]?.id ?? "";
      });
      setError(null);
    });
  }, [activeServer]);

  useEffect(() => {
    if (activeServer === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(EMPTY_OVERVIEW);
    setProjects([]);
    setWorktrees([]);
    setProjectId("");
    setFiles([]);
    setPreview(null);
    setPath("");
    setPathInput("");
    setReplyError(null);
    void reloadOverview().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeServer, reloadOverview]);

  // Live view: poll every 5s + refresh on event-hub activity.
  useLiveRefresh(activeServer, reloadOverview);

  // Agent/provider/model catalog: read-only overview, loaded once per server.
  // Failures stay local to the cards — they must not trip the page-wide
  // offline banner, which belongs to the live overview above.
  useEffect(() => {
    if (activeServer === null) return;
    let cancelled = false;
    setCatalogError(null);
    setAgents([]);
    setProviders([]);
    setModels([]);
    void Promise.all([
      listAgents(activeServer),
      listProviders(activeServer),
      listModels(activeServer),
    ]).then(([agentsRes, providersRes, modelsRes]) => {
      if (cancelled) return;
      const firstError = agentsRes.error ?? providersRes.error ?? modelsRes.error;
      if (firstError !== null) {
        setCatalogError(firstError);
        return;
      }
      setAgents(agentsRes.data ?? []);
      setProviders(providersRes.data ?? []);
      setModels(modelsRes.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [activeServer]);

  // File browser: only the listing, refetched when the path changes.
  useEffect(() => {
    if (activeServer === null) return;
    let cancelled = false;
    setFilesError(null);
    void listFiles(activeServer, path === "" ? undefined : path).then((result) => {
      if (cancelled) return;
      if (result.error !== null || result.data === null) {
        setFiles([]);
        setFilesError(result.error ?? t`Dateien konnten nicht geladen werden.`);
        return;
      }
      setFiles(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [activeServer, path]);

  // Worktrees need a project; the first one is preselected.
  useEffect(() => {
    if (activeServer === null || projectId === "") return;
    let cancelled = false;
    void listWorktrees(activeServer, projectId).then((result) => {
      if (cancelled) return;
      setWorktrees(result.error === null ? (result.data ?? []) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [activeServer, projectId]);

  if (server === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">
          <Trans>Server nicht gefunden</Trans>
        </h1>
        <button className="btn btn-primary w-fit" onClick={() => navigate("/")}>
          <Trans>Zurück zur Übersicht</Trans>
        </button>
      </div>
    );
  }

  const { offline } = reachability(error);
  const canReadFile = isActionEnabled(offline, "file-read");
  const canReplyPermission = isActionEnabled(offline, "permission-reply");
  const canAgentDetail = isActionEnabled(offline, "agent-detail");
  const canProviderList = isActionEnabled(offline, "provider-list");
  const serverName = server.name;
  const previewLimit = MAX_FILE_PREVIEW_CHARS.toLocaleString("de");
  const parent = parentPath(path);
  const sortedFiles = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  const providerIds = new Set(providers.map((p) => p.id));
  const modelsByProvider = new Map<string, ModelOption[]>();
  for (const model of models) {
    const list = modelsByProvider.get(model.providerID) ?? [];
    list.push(model);
    modelsByProvider.set(model.providerID, list);
  }
  const orphanModels = models.filter((m) => !providerIds.has(m.providerID));

  async function openFile(filePath: string) {
    if (activeServer === null || !canReadFile) return;
    setFilesError(null);
    const result = await readFile(activeServer, filePath);
    if (result.error !== null || result.data === null) {
      setPreview(null);
      setFilesError(result.error ?? t`Datei konnte nicht gelesen werden.`);
      return;
    }
    setPreview({ path: filePath, content: result.data });
  }

  function navigateTo(next: string) {
    setPath(next);
    setPathInput(next);
    setPreview(null);
  }

  async function handleReply(
    request: PermissionRequestRow,
    decision: "once" | "reject",
  ) {
    if (activeServer === null || replying !== null || !canReplyPermission) return;
    setReplying(request.id);
    setReplyError(null);
    const result = await replyPermission(activeServer, request, decision);
    setReplying(null);
    if (result.error !== null) {
      setReplyError(result.error);
      return;
    }
    setOverview((prev) => ({
      ...prev,
      permissions: prev.permissions.filter((item) => item.id !== request.id),
    }));
    reloadOverview();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          <Trans>Server-Werkzeuge: {serverName}</Trans>
        </h1>
        <Link className="btn btn-sm btn-ghost" to={`/servers/${server.id}`}>
          <Trans>Zurück zu den Serverdetails</Trans>
        </Link>
      </div>
      <p className="text-sm opacity-70">{server.baseUrl}</p>
      {error !== null && <OfflineAlert error={error} />}
      {loading && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card bg-base-200 shadow" data-testid="files-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="project" /> <Trans>Dateien</Trans>
            </h2>
            <p className="text-xs opacity-70">
              <Trans>Nur lesend: Verzeichnisse durchsuchen und Dateien ansehen.</Trans>
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                navigateTo(pathInput.trim().replace(/^\/+/, ""));
              }}
            >
              <input
                className="input input-bordered input-sm flex-1 font-mono"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder={t`Pfad im Projekt, z. B. src`}
                aria-label={t`Pfad im Projekt`}
                disabled={!canReadFile}
              />
              <button
                type="submit"
                className="btn btn-sm"
                disabled={!canReadFile}
                aria-label={t`Pfad öffnen`}
              >
                <Trans>Öffnen</Trans>
              </button>
              {parent !== null && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={!canReadFile}
                  onClick={() => navigateTo(parent)}
                  aria-label={t`Ein Verzeichnis zurück`}
                >
                  <Trans>Zurück</Trans>
                </button>
              )}
            </form>
            {filesError !== null && (
              <div className="alert alert-warning">
                <span>{filesError}</span>
              </div>
            )}
            {sortedFiles.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine Einträge.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="file-list">
                {sortedFiles.map((entry) => (
                  <li key={entry.path} data-testid={`file-entry-${entry.path}`}>
                    <button
                      type="button"
                      className="justify-between"
                      disabled={!canReadFile}
                      onClick={() =>
                        entry.type === "directory"
                          ? navigateTo(joinPath(path, entry.path))
                          : void openFile(entry.path)
                      }
                    >
                      <span className="truncate">
                        {entry.type === "directory" ? `${entry.path}/` : entry.path}
                      </span>
                      <span className="badge badge-ghost text-xs">
                        {entry.type === "directory" ? <Trans>Ordner</Trans> : <Trans>Datei</Trans>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {preview !== null && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold break-all">{preview.path}</span>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => setPreview(null)}
                    aria-label={t`Dateivorschau schließen`}
                  >
                    <Trans>Schließen</Trans>
                  </button>
                </div>
                {preview.content.truncated && (
                  <p className="text-xs opacity-70">
                    <Trans>Anzeige auf {previewLimit} Zeichen gekürzt.</Trans>
                  </p>
                )}
                <pre
                  className="text-xs bg-base-300 rounded p-2 whitespace-pre-wrap break-words max-h-72 overflow-auto"
                  data-testid="file-preview"
                >
                  {preview.content.text === "" ? t`Leere Datei.` : preview.content.text}
                </pre>
              </div>
            )}
          </div>
        </section>

        <section className="card bg-base-200 shadow" data-testid="vcs-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="project" /> <Trans>Git-Status</Trans>
            </h2>
            <p className="text-xs opacity-70">
              <Trans>Nur lesend: geänderte Dateien des Server-Verzeichnisses.</Trans>
            </p>
            {overview.vcs.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine Änderungen.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="vcs-list">
                {overview.vcs.map((row) => (
                  <li key={row.file} data-testid={`vcs-row-${row.file}`}>
                    <div className="flex items-center gap-2">
                      <span className={`${vcsBadgeClass(row.status)} badge-sm`}>
                        {VCS_LABELS[row.status]}
                      </span>
                      <span className="flex-1 truncate" title={row.file}>
                        {row.file}
                      </span>
                      <span className="text-xs opacity-70 font-mono">
                        {`+${row.additions} −${row.deletions}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card bg-base-200 shadow" data-testid="worktrees-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="project" /> <Trans>Worktrees</Trans>
            </h2>
            <label className="flex flex-col gap-1">
              <span className="label label-text">
                <Trans>Projekt</Trans>
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label={t`Projekt für Worktrees`}
                disabled={!canReadFile}
              >
                {projects.length === 0 ? (
                  <option value="">
                    <Trans>Keine Projekte</Trans>
                  </option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            {projectId === "" ? (
              <p className="opacity-70 text-sm">
                <Trans>Kein Projekt ausgewählt.</Trans>
              </p>
            ) : worktrees.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine Worktrees.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="worktree-list">
                {worktrees.map((row) => (
                  <li key={row.directory} data-testid={`worktree-row-${row.directory}`}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate" title={row.directory}>
                        {row.directory}
                      </span>
                      {row.strategy !== null && (
                        <span className="badge badge-ghost badge-sm">{row.strategy}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card bg-base-200 shadow" data-testid="mcp-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="project" /> <Trans>MCP-Server</Trans>
            </h2>
            <p className="text-xs opacity-70">
              <Trans>Nur lesend: konfigurierte MCP-Server und ihr Verbindungsstatus.</Trans>
            </p>
            {overview.mcp.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine MCP-Server konfiguriert.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="mcp-list">
                {overview.mcp.map((row) => (
                  <li key={row.name} data-testid={`mcp-row-${row.name}`}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`${mcpBadgeClass(row.status)} badge-sm`}>
                          {MCP_LABELS[row.status]}
                        </span>
                        <span className="flex-1 break-all">{row.name}</span>
                      </div>
                      {row.error !== null && (
                        <span className="text-xs opacity-70 break-all">{row.error}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card bg-base-200 shadow" data-testid="agents-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="session" /> <Trans>Agenten</Trans>
            </h2>
            <p className="text-xs opacity-70">
              <Trans>Nur lesend: konfigurierte Agenten mit Detailansicht.</Trans>
            </p>
            {catalogError !== null ? (
              <div className="alert alert-warning">
                <span>{catalogError}</span>
              </div>
            ) : agents.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine Agenten.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="agent-list">
                {agents.map((agent) => {
                  const agentLabel = agent.name;
                  return (
                  <li key={agent.id} data-testid={`agent-row-${agent.id}`}>
                    {canAgentDetail ? (
                      <Link
                        className="justify-between"
                        to={`/servers/${server.id}/agents/${agent.id}`}
                        aria-label={t`Details zu Agent ${agentLabel} anzeigen`}
                      >
                        <span className="truncate">{agent.name}</span>
                        <span className="badge badge-ghost text-xs">{agent.mode}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between opacity-50">
                        <span className="truncate">{agent.name}</span>
                        <span className="badge badge-ghost text-xs">{agent.mode}</span>
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="card bg-base-200 shadow" data-testid="providers-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="server" /> <Trans>Anbieter &amp; Modelle</Trans>
            </h2>
            <p className="text-xs opacity-70">
              <Trans>Nur lesend: konfigurierte Anbieter mit ihren Modellen.</Trans>
            </p>
            {catalogError !== null ? (
              <div className="alert alert-warning">
                <span>{catalogError}</span>
              </div>
            ) : !canProviderList ? (
              <p className="opacity-70 text-sm">
                <Trans>Server offline – Anbieterliste ist deaktiviert.</Trans>
              </p>
            ) : providers.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine Anbieter konfiguriert.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="provider-list">
                {providers.map((provider) => {
                  const providerModels = modelsByProvider.get(provider.id) ?? [];
                  const activationLabel = ACTIVATION_LABELS[provider.activation] ?? provider.activation;
                  return (
                    <li key={provider.id} data-testid={`provider-row-${provider.id}`}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-ghost badge-sm">{activationLabel}</span>
                          <span className="flex-1 break-all">{provider.name}</span>
                        </div>
                        {providerModels.length === 0 ? (
                          <span className="text-xs opacity-70">
                            <Trans>Keine Modelle.</Trans>
                          </span>
                        ) : (
                          <span className="text-xs opacity-70 break-all">
                            {providerModels.map((m) => m.name).join(", ")}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {orphanModels.length > 0 && (
                  <li data-testid="provider-row-orphans">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-ghost badge-sm">
                          <Trans>Ohne Anbieter</Trans>
                        </span>
                      </div>
                      <span className="text-xs opacity-70 break-all">
                        {orphanModels.map((m) => m.name).join(", ")}
                      </span>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

        <section className="card bg-base-200 shadow md:col-span-2" data-testid="permissions-card">
          <div className="card-body">
            <h2 className="card-title">
              <Icon name="project" /> <Trans>Offene Berechtigungen</Trans>
            </h2>
            <p className="text-xs opacity-70">
              <Trans>
                Anfragen des Servers, die auf eine Entscheidung warten. Erlaubt wird einmalig
                („Einmal erlauben“) oder abgelehnt.
              </Trans>
            </p>
            {replyError !== null && (
              <div className="alert alert-warning">
                <span>{replyError}</span>
              </div>
            )}
            {overview.permissions.length === 0 ? (
              <p className="opacity-70 text-sm">
                <Trans>Keine offenen Anfragen.</Trans>
              </p>
            ) : (
              <ul className="menu gap-1" data-testid="permission-list">
                {overview.permissions.map((row) => {
                  const requestId = row.id;
                  return (
                  <li key={requestId} data-testid={`permission-row-${requestId}`}>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-ghost badge-sm">{row.action}</span>
                        <span className="flex-1 break-all text-sm">
                          {row.message ?? (row.resources.length > 0 ? row.resources.join(", ") : "–")}
                        </span>
                        <button
                          type="button"
                          className="btn btn-xs btn-primary"
                          disabled={!canReplyPermission || replying !== null}
                          aria-label={t`Anfrage ${requestId} einmalig erlauben`}
                          onClick={() => void handleReply(row, "once")}
                        >
                          <Trans>Einmal erlauben</Trans>
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-error btn-outline"
                          disabled={!canReplyPermission || replying !== null}
                          aria-label={t`Anfrage ${requestId} ablehnen`}
                          onClick={() => void handleReply(row, "reject")}
                        >
                          <Trans>Ablehnen</Trans>
                        </button>
                      </div>
                      {row.message !== null && row.resources.length > 0 && (
                        <span className="text-xs opacity-70 break-all">
                          {row.resources.join(", ")}
                        </span>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}