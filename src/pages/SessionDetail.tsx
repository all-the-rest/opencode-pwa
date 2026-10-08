import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import ChatMessageList from "../components/ChatMessageList.tsx";
import PromptComposer from "../components/PromptComposer.tsx";
import SessionRunIndicators from "../components/SessionRunIndicators.tsx";
import SessionDiffView from "../components/SessionDiffView.tsx";
import Icon from "../components/Icon.tsx";
import { SESSION_PAGE_SIZE, useSessionMessages, type SessionMessageSource } from "../hooks/useSessionMessages.ts";
import { useSessionRunState } from "../hooks/useSessionRunState.ts";
import {
  cancelSessionForm,
  cancelSessionInbox,
  clearSessionRevert,
  commitSessionRevert,
  compactSession,
  exportSession,
  extractSessionRename,
  extractSessionRows,
  forkSession,
  getSessionDiff,
  getSessionInfo,
  getSessionStats,
  importSession,
  initVcs,
  interruptSession,
  listAgents,
  listCommands,
  listModels,
  listProjects,
  listSessionForms,
  listSessionInbox,
  listSessions,
  readSessionTerminal,
  renameSession,
  updateSessionInbox,
  modelLabelLookup,
  modelOptionValue,
  parseFormAnswerText,
  parseModelOptionValue,
  parseSessionTransferText,
  removeSession,
  replySessionForm,
  runSessionCommand,
  sendPrompt,
  sessionTitle,
  stageSessionRevert,
  switchSessionAgent,
  switchSessionModel,
  type AgentOption,
  type CommandRow,
  type ModelOption,
  type ProjectInfo,
  type ServerConfig,
  type SessionDiffRow,
  type SessionFormRow,
  type SessionInboxDelivery,
  type SessionInboxRow,
  type SessionRevertInfo,
  type SessionStatsSummary,
  type SessionTerminalScreen,
  type TokenUsage,
} from "../lib/opencode.ts";
import { isActionEnabled, reachability } from "../lib/offline.ts";
import {
  createFileAttachment,
  pathAttachmentID,
  toPromptFileAttachments,
  type PromptAttachment,
} from "../lib/promptAttachments.ts";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import { useServers } from "../state/servers.tsx";
import { useToast } from "../state/toast.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";

function countLabel(total: number, source: SessionMessageSource): string {
  const base = total === 1 ? t`1 Nachricht` : t`${total} Nachrichten`;
  if (source === "live") return t`${base} (live)`;
  if (source === "cache") return t`${base} (aus Zwischenspeicher)`;
  return t`${base} (offline aus Zwischenspeicher)`;
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { servers, selectedServer } = useServers();
  // Feedback policy: every session action answers with a toast (success or
  // error) instead of an inline alert box — the same pattern as the rename
  // rollback above. Destructive *questions* stay in the ConfirmDialog.
  const { notify } = useToast();
  const { ensureTab, retitleTab, tabs } = useSessionTabs();
  const serverId = searchParams.get("server") ?? selectedServer?.id ?? null;
  const server = servers.find((s) => s.id === serverId) ?? selectedServer;

  // Opening a session registers its tab (server-bound). Direct navigation
  // uses the session id as the label; the ServerDetail link passes the real
  // title via `openTab`, which must not be downgraded — so a missing tab is
  // only added, never refreshed. `ensureTab` is state-only (no `tabs`
  // dependency), so closing a tab never re-registers it before unmount.
  useEffect(() => {
    if (server === null || server === undefined || id === undefined) return;
    ensureTab({ serverID: server.id, sessionID: id, title: id });
  }, [server, id, ensureTab]);

  // Direct-URL mount: resolve the real session title from the session list
  // (fetched once per server+id) instead of showing the raw session id.
  // Fallback: the id stays the label when the list is unreachable (offline)
  // or the id matches no known session. The same row carries the project key,
  // which the diff surface uses to tell "no changes" from "no git repo".
  useEffect(() => {
    if (server === null || server === undefined || id === undefined) return;
    let cancelled = false;
    void listSessions(server).then((result) => {
      if (cancelled) return;
      const match = extractSessionRows(result.data).find((row) => row.id === id);
      if (match !== undefined) {
        retitleTab(server.id, id, match.label);
        setSessionProjectKey(match.projectKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [server, id, retitleTab]);

  // Live-sync: `session.renamed` events retitle the open tab immediately
  // (not just on mount via the session list).
  useEffect(() => {
    if (server === null || server === undefined || id === undefined) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    return subscribeServerEvents(activeServer, (event: unknown) => {
      const renamed = extractSessionRename(event);
      if (renamed === null || renamed.sessionID !== activeSession) return;
      retitleTab(activeServer.id, activeSession, sessionTitle(renamed.title, activeSession));
    });
  }, [server, id, retitleTab]);

  const {
    visible,
    total,
    hasMore,
    loadMore,
    loading,
    refreshing,
    error,
    source,
    liveCount,
    addLocalMessage,
    dropLocalMessage,
  } = useSessionMessages(server, id, SESSION_PAGE_SIZE);
  // Derived run state drives the live progress indicators (working row, retry
  // card, interrupted/error divider) below the message list.
  const run = useSessionRunState(server, id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    "interrupt" | "delete" | "fork" | "compact" | "revert-commit" | "init-git" | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // Parity batch 3: revert staging, share/export-import, command run.
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [revertMessageID, setRevertMessageID] = useState("");
  const [stagedRevert, setStagedRevert] = useState<SessionRevertInfo | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [commandName, setCommandName] = useState("");
  const [commandText, setCommandText] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  // Secondary panels live one tap away behind a single "Mehr…" disclosure
  // (chat + composer dominate the view); exactly one tab shows at a time.
  type MoreTab =
    | "stats"
    | "diff"
    | "revert"
    | "share"
    | "command"
    | "inbox"
    | "forms"
    | "terminal";
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreTab, setMoreTab] = useState<MoreTab>("stats");
  // Parity batch 3: session inbox (queued entries) and pending forms.
  const [inboxRows, setInboxRows] = useState<SessionInboxRow[] | null>(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [cancellingInbox, setCancellingInbox] = useState<string | null>(null);
  const [updatingInbox, setUpdatingInbox] = useState<string | null>(null);
  const [formRows, setFormRows] = useState<SessionFormRow[] | null>(null);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormID, setSelectedFormID] = useState("");
  const [formAnswerText, setFormAnswerText] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  // Parity batch 4: read-only session terminal (no emulator, no input).
  const [terminalScreen, setTerminalScreen] = useState<SessionTerminalScreen | null>(null);
  const [terminalLoaded, setTerminalLoaded] = useState(false);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState<TokenUsage | null>(null);
  const [sessionCost, setSessionCost] = useState<number | null>(null);
  const [globalStats, setGlobalStats] = useState<SessionStatsSummary | null>(null);
  const [diffRows, setDiffRows] = useState<SessionDiffRow[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  // Rendered diff (wave 4): the project list tells "keine Änderungen" from
  // "kein Git-Repository", the project key comes from the session list row.
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessionProjectKey, setSessionProjectKey] = useState<string | null>(null);
  const [initGitBusy, setInitGitBusy] = useState(false);
  const [gitDirectory, setGitDirectory] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [showJumpToNewest, setShowJumpToNewest] = useState(false);
  // Window-scroll chat behavior: stick to the bottom for new live messages
  // only while the user is already near the bottom (never yank while
  // reading history). `loadMore` prepends older messages and restores the
  // offset instead.
  const nearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const preserveOffsetRef = useRef<number | null>(null);
  const stickAfterSendRef = useRef(false);
  const prevVisibleLengthRef = useRef(0);

  function scrollToBottom() {
    window.scrollTo(0, document.documentElement.scrollHeight);
  }

  function isNearBottom(): boolean {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
  }

  useEffect(() => {
    function onScroll() {
      nearBottomRef.current = isNearBottom();
      setShowJumpToNewest(!nearBottomRef.current && total > 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [total]);

  useEffect(() => {
    if (loading || visible.length === 0) return;
    if (preserveOffsetRef.current !== null) {
      window.scrollTo(0, document.documentElement.scrollHeight - preserveOffsetRef.current);
      preserveOffsetRef.current = null;
      prevVisibleLengthRef.current = visible.length;
      return;
    }
    const grew = visible.length > prevVisibleLengthRef.current;
    prevVisibleLengthRef.current = visible.length;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      scrollToBottom();
      return;
    }
    if (grew && (nearBottomRef.current || stickAfterSendRef.current)) {
      stickAfterSendRef.current = false;
      scrollToBottom();
    }
  }, [loading, visible.length]);

  // Streaming stickiness keyed to the run state: while a turn is active and the
  // user is already near the bottom (or just sent a message), follow the
  // arriving content. `liveCount` bumps on every `content.updated` snapshot, so
  // the view tracks streamed text without yanking a reader scrolled into
  // history. This complements — never duplicates — the length-based effect
  // above (which owns new messages and load-more prepends).
  useEffect(() => {
    if (run.status !== "active") return;
    if (nearBottomRef.current || stickAfterSendRef.current) {
      stickAfterSendRef.current = false;
      scrollToBottom();
    }
  }, [run.status, run.assistantMessageID, liveCount]);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [currentModelValue, setCurrentModelValue] = useState<string>("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  // Composer attachments: workspace-path chips (`file://…`) plus picked or
  // dropped files (base64, sent inline). The mapping to the client's
  // `PromptFileAttachment` shape lives in `promptAttachments.ts`.
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const modelLabels = useMemo(() => modelLabelLookup(models), [models]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevVisibleLengthRef.current = 0;
    preserveOffsetRef.current = null;
    nearBottomRef.current = true;
    setShowJumpToNewest(false);
    setMoreOpen(false);
    setMoreTab("stats");
    setStagedRevert(null);
    setRevertMessageID("");
    setExportText(null);
    setImportText("");
    setRenaming(false);
    setRenameText("");
    setCommandName("");
    setCommandText("");
    setInboxRows(null);
    setInboxError(null);
    setFormRows(null);
    setSelectedFormID("");
    setFormAnswerText("");
    setTerminalScreen(null);
    setTerminalLoaded(false);
    setTerminalError(null);
  }, [id]);

  const handleLoadMore = useCallback(() => {
    // Remember the distance from the viewport top to the page bottom so the
    // view stays anchored on the same message after older ones prepend.
    preserveOffsetRef.current = document.documentElement.scrollHeight - window.scrollY;
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (node === null || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first !== undefined && first.isIntersecting) handleLoadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, handleLoadMore]);

  useEffect(() => {
    if (server === null || server === undefined || id === undefined) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    let cancelled = false;
    setPickerError(null);
    void Promise.all([
      listAgents(activeServer),
      listModels(activeServer),
      getSessionInfo(activeServer, activeSession),
      getSessionStats(activeServer),
      listCommands(activeServer),
    ]).then(([agentsRes, modelsRes, infoRes, statsRes, commandsRes]) => {
      if (cancelled) return;
      const firstError = agentsRes.error ?? modelsRes.error ?? infoRes.error;
      if (firstError !== null) {
        setPickerError(firstError);
        return;
      }
      setAgents(agentsRes.data ?? []);
      setModels(modelsRes.data ?? []);
      if (commandsRes.error === null) setCommands(commandsRes.data ?? []);
      const info = infoRes.data;
      setCurrentAgent(info?.agent ?? null);
      setSessionTokens(info?.tokens ?? null);
      setSessionCost(info?.cost ?? null);
      setCurrentModelValue(
        info?.model === null || info?.model === undefined
          ? ""
          : modelOptionValue({
              id: info.model.id,
              providerID: info.model.providerID,
              ...(info.model.variant !== undefined ? { variant: info.model.variant } : {}),
            }),
      );
      // The global stats call is best-effort: the per-session card above must
      // not fail just because the aggregate endpoint is unreachable.
      if (statsRes.error === null) setGlobalStats(statsRes.data);
    });
    return () => {
      cancelled = true;
    };
  }, [server, id]);

  const showInitialSpinner = loading && total === 0;
  const showEmpty = !loading && error === null && total === 0;
  const showList = !showInitialSpinner && (total > 0 || error !== null);
  // The "Denkt…" row shows only while a turn is active and no assistant text
  // has arrived yet (`assistantMessageID` is set the moment a content snapshot
  // lands). Once parts stream in, the assistant message itself renders instead.
  const showWorking = run.status === "active" && run.assistantMessageID === null;
  const serverName = server?.name ?? "";
  const remaining = total - visible.length;
  const { offline } = reachability(error);
  const canFork = isActionEnabled(offline, "session-fork");
  const canCompact = isActionEnabled(offline, "session-compact");
  const canDiff = isActionEnabled(offline, "session-diff");
  const canRevert = isActionEnabled(offline, "session-revert");
  const canExport = isActionEnabled(offline, "session-export");
  const canImport = isActionEnabled(offline, "session-import");
  const canRunCommand = isActionEnabled(offline, "session-command");
  const canInbox = isActionEnabled(offline, "session-inbox");
  const canInboxCancel = isActionEnabled(offline, "session-inbox-cancel");
  const canInboxUpdate = isActionEnabled(offline, "session-inbox-update");
  const canFormList = isActionEnabled(offline, "session-form-list");
  const canFormReply = isActionEnabled(offline, "session-form-reply");
  const canFormCancel = isActionEnabled(offline, "session-form-cancel");
  const canTerminal = isActionEnabled(offline, "terminal-read");
  const canVcsInit = isActionEnabled(offline, "vcs-init");
  // Lingui messages take plain variables only — no member access or calls —
  // so every formatted stat is hoisted here (see `lingui/no-expression-in-message`).
  const statInput = (sessionTokens?.input ?? 0).toLocaleString("de");
  const statOutput = (sessionTokens?.output ?? 0).toLocaleString("de");
  const statReasoning = (sessionTokens?.reasoning ?? 0).toLocaleString("de");
  const statCacheRead = (sessionTokens?.cacheRead ?? 0).toLocaleString("de");
  const statCacheWrite = (sessionTokens?.cacheWrite ?? 0).toLocaleString("de");
  const statCost = (sessionCost ?? 0).toLocaleString("de", {
    style: "currency",
    currency: "USD",
  });
  const totalPrompts = globalStats?.prompts ?? 0;
  const totalSteps = globalStats?.steps ?? 0;
  const totalToolCalls = globalStats?.toolCalls ?? null;
  // Lingui-safe hoists for the staged revert (no member access in messages).
  const stagedMessageID = stagedRevert?.messageID ?? "";
  const stagedFileCount = stagedRevert?.fileCount ?? null;
  // Heading shows the resolved session title once known (the tab state
  // already carries the retitled label); the raw id stays visible below.
  // `title || id` everywhere — never the bare "Session" placeholder.
  const tabTitle = tabs.find((entry) => entry.serverID === server?.id && entry.sessionID === id)?.title;
  const displayTitle = id === undefined ? null : sessionTitle(tabTitle, id);

  function addAttachment(path: string) {
    setAttachmentError(null);
    setAttachments((prev) => {
      const id = pathAttachmentID(path);
      if (prev.some((entry) => entry.id === id)) return prev;
      return [...prev, { kind: "path", id, path }];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((entry) => entry.id !== id));
  }

  /** Read picked/dropped files as base64 and attach the usable ones. */
  async function handleAttachFiles(files: File[]) {
    setAttachmentError(null);
    let rejected = false;
    for (const file of files) {
      const result = await createFileAttachment(file);
      if (!result.ok) {
        rejected = true;
        continue;
      }
      setAttachments((prev) =>
        prev.some((entry) => entry.id === result.attachment.id) ? prev : [...prev, result.attachment],
      );
    }
    if (rejected) {
      setAttachmentError(t`Einige Dateien wurden nicht angehängt (Typ oder Größe).`);
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (server === null || server === undefined || id === undefined) return;
    if (text === "" || sending) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    const files = toPromptFileAttachments(attachments);
    const attached = attachments;
    setDraft("");
    setAttachments([]);
    setSendError(null);
    const localID = addLocalMessage("user", text);
    stickAfterSendRef.current = true;
    setSending(true);
    const result = await sendPrompt(activeServer, activeSession, text, files);
    setSending(false);
    // The server echo carries its own message id, so the optimistic entry
    // is dropped and replaced by the live/network message shortly after.
    dropLocalMessage(localID);
    if (result.error !== null) {
      setSendError(result.error);
      setDraft(text);
      setAttachments(attached);
    }
  }

  function handleStop() {
    if (server === null || server === undefined || id === undefined) return;
    void interruptSession(server, id).then((result) => {
      if (result.error !== null) {
        setSendError(result.error);
        return;
      }
      notify(t`Ausführung unterbrochen.`, "success");
    });
  }

  async function handleAgentChange(value: string) {
    if (server === null || server === undefined || id === undefined || value === "" || switching) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setSwitching(true);
    setPickerError(null);
    const result = await switchSessionAgent(activeServer, activeSession, value);
    setSwitching(false);
    if (result.error !== null) {
      setPickerError(result.error);
      return;
    }
    setCurrentAgent(value);
  }

  async function handleModelChange(value: string) {
    if (server === null || server === undefined || id === undefined || value === "" || switching) return;
    const model = parseModelOptionValue(value);
    if (model === null) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setSwitching(true);
    setPickerError(null);
    const result = await switchSessionModel(activeServer, activeSession, model);
    setSwitching(false);
    if (result.error !== null) {
      setPickerError(result.error);
      return;
    }
    setCurrentModelValue(value);
  }

  async function handleRename() {
    if (server === null || server === undefined || id === undefined) return;
    const next = renameText.trim();
    if (next === "" || renameBusy) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    const previous = sessionTitle(tabTitle, activeSession);
    // Optimistic update: the tab and heading switch immediately; a failed
    // PATCH rolls back and raises a toast (never a blocking dialog).
    retitleTab(activeServer.id, activeSession, sessionTitle(next, activeSession));
    setRenaming(false);
    setRenameBusy(true);
    const result = await renameSession(activeServer, activeSession, next);
    setRenameBusy(false);
    if (result.error !== null) {
      retitleTab(activeServer.id, activeSession, previous);
      const renameError = result.error;
      notify(t`Umbenennen fehlgeschlagen: ${renameError}`, "error");
    }
  }

  async function handleConfirm() {
    if (server === null || server === undefined || id === undefined || confirm === null) return;
    const activeServer: ServerConfig = server;
    const activeSession: string = id;
    setConfirmBusy(true);
    if (confirm === "fork") {
      const result = await forkSession(activeServer, activeSession);
      setConfirmBusy(false);
      setConfirm(null);
      if (result.error !== null || result.data === null) {
        notify(result.error ?? t`Forken fehlgeschlagen.`, "error");
        return;
      }
      notify(t`Session geforkt – die Kopie ist geöffnet.`, "success");
      navigate(`/sessions/${result.data.id}?server=${activeServer.id}`);
      return;
    }
    if (confirm === "compact") {
      const result = await compactSession(activeServer, activeSession);
      setConfirmBusy(false);
      setConfirm(null);
      if (result.error !== null) {
        notify(result.error, "error");
        return;
      }
      notify(t`Kompaktierung gestartet – der Kontext wird zusammengefasst.`, "success");
      return;
    }
    if (confirm === "revert-commit") {
      const result = await commitSessionRevert(activeServer, activeSession);
      setConfirmBusy(false);
      setConfirm(null);
      if (result.error !== null) {
        notify(result.error, "error");
        return;
      }
      setStagedRevert(null);
      notify(t`Revert übernommen – die Session steht auf dem gewählten Stand.`, "success");
      return;
    }
    if (confirm === "init-git") {
      await runInitGit();
      setConfirmBusy(false);
      return;
    }
    const result =
      confirm === "interrupt"
        ? await interruptSession(activeServer, activeSession)
        : await removeSession(activeServer, activeSession);
    setConfirmBusy(false);
    setConfirm(null);
    if (result.error !== null) {
      notify(result.error, "error");
      return;
    }
    if (confirm === "delete") {
      notify(t`Session gelöscht.`, "success");
      navigate(`/servers/${activeServer.id}`);
      return;
    }
    notify(t`Ausführung unterbrochen.`, "success");
  }

  async function ensureDiffLoaded() {
    if (diffRows !== null || diffLoading) return;
    if (server === null || server === undefined || id === undefined) return;
    setDiffLoading(true);
    setDiffError(null);
    const [result, projectResult] = await Promise.all([
      getSessionDiff(server, id),
      listProjects(server),
    ]);
    setDiffLoading(false);
    if (projectResult.error === null && projectResult.data !== null) setProjects(projectResult.data);
    if (result.error !== null || result.data === null) {
      setDiffError(result.error ?? t`Diffs konnten nicht geladen werden.`);
      return;
    }
    setDiffRows(result.data);
  }

  // Wave 4: the empty state offers to create the missing git repository; the
  // write itself goes through the same German confirm as every other write.
  function askInitGit(directory: string | null) {
    if (!canVcsInit || initGitBusy) return;
    setGitDirectory(directory);
    setConfirm("init-git");
  }

  async function runInitGit() {
    if (server === null || server === undefined) return;
    setInitGitBusy(true);
    const result = await initVcs(server, gitDirectory);
    setInitGitBusy(false);
    setConfirm(null);
    if (result.error !== null) {
      notify(t`Git-Repository konnte nicht erstellt werden.`, "error");
      return;
    }
    notify(t`Git-Repository erstellt – die Änderungen werden neu geladen.`, "success");
    setDiffRows(null);
    void ensureDiffLoaded();
  }

  // --- Parity batch 3: staged revert (stage → commit with confirm / clear) ---

  async function handleStageRevert() {
    if (server === null || server === undefined || id === undefined) return;
    if (revertMessageID === "" || revertBusy || !canRevert) return;
    setRevertBusy(true);
    const result = await stageSessionRevert(server, id, revertMessageID);
    setRevertBusy(false);
    if (result.error !== null || result.data === null) {
      notify(result.error ?? t`Staging fehlgeschlagen.`, "error");
      return;
    }
    setStagedRevert(result.data);
  }

  async function handleClearRevert() {
    if (server === null || server === undefined || id === undefined) return;
    if (revertBusy || !canRevert) return;
    setRevertBusy(true);
    const result = await clearSessionRevert(server, id);
    setRevertBusy(false);
    if (result.error !== null) {
      notify(result.error, "error");
      return;
    }
    setStagedRevert(null);
    notify(t`Staging verworfen – die Session ist unverändert.`, "success");
  }

  // --- Parity batch 3: share via export/import JSON ---

  async function handleExport() {
    if (server === null || server === undefined || id === undefined) return;
    if (shareBusy || !canExport) return;
    setShareBusy(true);
    const result = await exportSession(server, id);
    setShareBusy(false);
    if (result.error !== null || result.data === null) {
      notify(result.error ?? t`Export fehlgeschlagen.`, "error");
      return;
    }
    setExportText(JSON.stringify(result.data, null, 2));
  }

  function downloadExport() {
    if (exportText === null || id === undefined) return;
    const url = URL.createObjectURL(
      new Blob([exportText], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `session-${id}-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File | undefined) {
    if (file === undefined) return;
    void file.text().then((text) => setImportText(text));
  }

  async function handleImport() {
    if (server === null || server === undefined) return;
    if (importText.trim() === "" || importBusy || !canImport) return;
    const parsed = parseSessionTransferText(importText);
    if (parsed.payload === null) {
      notify(parsed.error ?? t`Import fehlgeschlagen.`, "error");
      return;
    }
    setImportBusy(true);
    const result = await importSession(server, parsed.payload);
    setImportBusy(false);
    if (result.error !== null || result.data === null) {
      notify(result.error ?? t`Import fehlgeschlagen.`, "error");
      return;
    }
    notify(t`Session importiert – die neue Session ist geöffnet.`, "success");
    navigate(`/sessions/${result.data.id}?server=${server.id}`);
  }

  // --- Parity batch 3: run a slash command in this session ---

  async function handleRunCommand() {
    if (server === null || server === undefined || id === undefined) return;
    if (commandName === "" || commandBusy || !canRunCommand) return;
    setCommandBusy(true);
    const result = await runSessionCommand(server, id, commandName, commandText);
    setCommandBusy(false);
    if (result.error !== null) {
      notify(result.error, "error");
      return;
    }
    notify(t`Befehl „${commandName}“ gestartet.`, "success");
  }

  // --- Parity batch 3: session inbox (queued entries, cancel only) ---

  async function loadInbox() {
    if (server === null || server === undefined || id === undefined) return;
    setInboxLoading(true);
    setInboxError(null);
    const result = await listSessionInbox(server, id);
    setInboxLoading(false);
    if (result.error !== null || result.data === null) {
      setInboxError(result.error ?? t`Inbox konnte nicht geladen werden.`);
      return;
    }
    setInboxRows(result.data);
  }

  function selectMoreTab(tab: MoreTab) {
    setMoreTab(tab);
    // Lazy-load the tab's data on first selection (previously on toggle).
    if (tab === "diff") void ensureDiffLoaded();
    if (tab === "inbox" && inboxRows === null && !inboxLoading) void loadInbox();
    if (tab === "forms" && formRows === null && !formsLoading) void loadForms();
    if (tab === "terminal" && !terminalLoaded && !terminalLoading) void loadTerminal();
  }

  async function handleUpdateInbox(inboxID: string, delivery: SessionInboxDelivery) {
    if (server === null || server === undefined || id === undefined) return;
    if (updatingInbox !== null || cancellingInbox !== null || !canInboxUpdate) return;
    setUpdatingInbox(inboxID);
    setInboxError(null);
    const result = await updateSessionInbox(server, id, inboxID, delivery);
    setUpdatingInbox(null);
    if (result.error !== null) {
      setInboxError(result.error);
      return;
    }
    setInboxRows((prev) =>
      prev === null ? prev : prev.map((row) => (row.id === inboxID ? { ...row, delivery } : row)),
    );
  }

  async function handleCancelInbox(inboxID: string) {
    if (server === null || server === undefined || id === undefined) return;
    if (cancellingInbox !== null || updatingInbox !== null || !canInboxCancel) return;
    setCancellingInbox(inboxID);
    setInboxError(null);
    const result = await cancelSessionInbox(server, id, inboxID);
    setCancellingInbox(null);
    if (result.error !== null) {
      setInboxError(result.error);
      return;
    }
    setInboxRows((prev) => (prev === null ? prev : prev.filter((row) => row.id !== inboxID)));
  }

  // --- Parity batch 3: pending session forms (reply / cancel) ---

  async function loadForms() {
    if (server === null || server === undefined || id === undefined) return;
    setFormsLoading(true);
    const result = await listSessionForms(server, id);
    setFormsLoading(false);
    if (result.error !== null || result.data === null) {
      notify(result.error ?? t`Formulare konnten nicht geladen werden.`, "error");
      return;
    }
    setFormRows(result.data);
    setSelectedFormID((current) => {
      if (result.data?.some((row) => row.id === current) === true) return current;
      return result.data?.[0]?.id ?? "";
    });
  }

  async function handleReplyForm() {
    if (server === null || server === undefined || id === undefined) return;
    if (selectedFormID === "" || formBusy || !canFormReply) return;
    const parsed = parseFormAnswerText(formAnswerText);
    if (parsed.answer === null) {
      notify(parsed.error ?? t`Antworten fehlgeschlagen.`, "error");
      return;
    }
    setFormBusy(true);
    const result = await replySessionForm(server, id, selectedFormID, parsed.answer);
    setFormBusy(false);
    if (result.error !== null) {
      notify(result.error, "error");
      return;
    }
    setFormRows((prev) =>
      prev === null ? prev : prev.filter((row) => row.id !== selectedFormID),
    );
    setSelectedFormID("");
    setFormAnswerText("");
    notify(t`Formular beantwortet.`, "success");
  }

  async function handleCancelForm() {
    if (server === null || server === undefined || id === undefined) return;
    if (selectedFormID === "" || formBusy || !canFormCancel) return;
    setFormBusy(true);
    const result = await cancelSessionForm(server, id, selectedFormID);
    setFormBusy(false);
    if (result.error !== null) {
      notify(result.error, "error");
      return;
    }
    setFormRows((prev) =>
      prev === null ? prev : prev.filter((row) => row.id !== selectedFormID),
    );
    setSelectedFormID("");
    notify(t`Formular abgelehnt.`, "success");
  }

  // --- Parity batch 4: read-only session terminal (screen text, no input) ---

  async function loadTerminal() {
    if (server === null || server === undefined || id === undefined) return;
    setTerminalLoading(true);
    setTerminalError(null);
    const result = await readSessionTerminal(server, id, 200);
    setTerminalLoading(false);
    if (result.error !== null) {
      setTerminalError(result.error);
      return;
    }
    setTerminalScreen(result.data);
    setTerminalLoaded(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold flex-1 min-w-48 break-all">
          {displayTitle === null ? <Trans>Session</Trans> : displayTitle}
        </h1>
        {server !== null && server !== undefined && id !== undefined && (
          <>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title={t`Session umbenennen`}
              aria-label={t`Session umbenennen`}
              onClick={() => {
                setRenameText(displayTitle ?? id);
                setRenaming((open) => !open);
              }}
            >
              <Icon name="edit" /> <Trans>Umbenennen</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title={t`Session ab dem aktuellen Stand kopieren`}
              aria-label={t`Session forken`}
              disabled={!canFork}
              onClick={() => setConfirm("fork")}
            >
              <Icon name="fork" /> <Trans>Forken</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title={t`Kontext der Session zusammenfassen`}
              aria-label={t`Session kompaktieren`}
              disabled={!canCompact}
              onClick={() => setConfirm("compact")}
            >
              <Icon name="compact" /> <Trans>Kompaktieren</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title={t`Laufende Ausführung unterbrechen`}
              aria-label={t`Ausführung unterbrechen`}
              onClick={() => setConfirm("interrupt")}
            >
              <Icon name="stop" /> <Trans>Unterbrechen</Trans>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-error"
              title={t`Session löschen`}
              aria-label={t`Session löschen`}
              onClick={() => setConfirm("delete")}
            >
              <Icon name="trash" /> <Trans>Löschen</Trans>
            </button>
          </>
        )}
      </div>
      <p className="text-sm opacity-70 font-mono break-all">{id}</p>
      {renaming && server !== null && server !== undefined && id !== undefined && (
        <form
          className="flex gap-2"
          data-testid="session-rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleRename();
          }}
        >
          <input
            className="input input-bordered input-sm flex-1"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            aria-label={t`Neuer Session-Titel`}
            placeholder={t`Titel eingeben …`}
            disabled={renameBusy}
            data-testid="session-rename-input"
          />
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={renameBusy || renameText.trim() === ""}
            aria-label={t`Titel speichern`}
            data-testid="session-rename-save"
          >
            <Trans>Speichern</Trans>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={renameBusy}
            aria-label={t`Umbenennen abbrechen`}
            onClick={() => setRenaming(false)}
          >
            <Trans>Abbrechen</Trans>
          </button>
          {/* Blocked on purpose: `session.update` accepts `title: ""` / null /
              missing (204) but then leaves the stored title untouched — there
              is no API path back to the generated server default. Verified
              against a live server; see features/02-api-contract.md. */}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled
            aria-label={t`Titel zurücksetzen`}
            title={t`Nicht möglich: Der Server behält einen gesetzten Titel. Ein leerer Titel wird von PATCH /api/session/<id> übergangen.`}
            data-testid="session-rename-reset"
          >
            <Trans>Titel zurücksetzen</Trans>
          </button>
        </form>
      )}
      {server === null || server === undefined ? (
        <div className="alert alert-info">
          <span>
            <Trans>Kein Server ausgewählt. Wähle oben einen Server.</Trans>
          </span>
        </div>
      ) : (
        <>
          <p className="text-sm opacity-70">
            <Trans>Server: {serverName}</Trans>
          </p>
          {pickerError !== null && (
            <div className="alert alert-error">
              <span>
                <Trans>Agent/Modell konnte nicht gewechselt werden: {pickerError}</Trans>
              </span>
            </div>
          )}
          {attachmentError !== null && (
            <div className="alert alert-warning">
              <span>
                <Trans>Anhang fehlgeschlagen: {attachmentError}</Trans>
              </span>
            </div>
          )}
          <p className="text-sm opacity-70" data-testid="cache-status">
            {loading && total === 0 ? (
              <Trans>Nachrichten werden geladen …</Trans>
            ) : (
              <>
                {countLabel(total, source)}
                {refreshing && total > 0 && (
                  <>
                    {" – "}
                    <Trans>Aktualisiere …</Trans>
                  </>
                )}
                {liveCount > 0 && (
                  <>
                    {" · "}
                    <Trans>{liveCount} neue</Trans>
                  </>
                )}
              </>
            )}
          </p>
          {showInitialSpinner && <span className="loading loading-spinner loading-md" aria-label={t`Lädt`} />}
          {error !== null && total === 0 && !loading && (
            <div className="alert alert-warning">
              <span>
                <Trans>Nachrichten konnten nicht geladen werden (offline?): {error}</Trans>
              </span>
            </div>
          )}
          {error !== null && total > 0 && (
            <div className="alert alert-warning">
              <span>
                <Trans>Offline: zwischengespeicherte Nachrichten werden angezeigt ({error}).</Trans>
              </span>
            </div>
          )}
          {sendError !== null && (
            <div className="alert alert-error">
              <span>
                <Trans>Senden fehlgeschlagen: {sendError}</Trans>
              </span>
            </div>
          )}
          {showEmpty && (
            <p className="opacity-70 text-sm" data-testid="message-empty-state">
              <Trans>Keine Nachrichten vorhanden. Schreibe unten die erste Nachricht.</Trans>
            </p>
          )}
          {showList && total > 0 && (
            <>
              <div ref={sentinelRef} data-testid="load-more-sentinel" aria-hidden="true" />
              {hasMore && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm self-center"
                  onClick={handleLoadMore}
                  aria-label={t`Ältere Nachrichten laden`}
                >
                  <Trans>Ältere Nachrichten laden ({remaining} weitere)</Trans>
                </button>
              )}
              <ChatMessageList messages={visible} modelNames={modelLabels} />
              <SessionRunIndicators run={run} showWorking={showWorking} />
            </>
          )}
          {showJumpToNewest && (
            <button
              type="button"
              className="btn btn-primary btn-sm fixed bottom-44 left-1/2 z-10 -translate-x-1/2 shadow-lg"
              onClick={scrollToBottom}
              aria-label={t`Zu neuesten springen`}
              data-testid="jump-to-newest"
            >
              <Trans>Neueste ↓</Trans>
            </button>
          )}
          {/* Chat-first: the composer sits directly below the conversation
              (attachments + autogrowing editor + agent/model chips + send/stop);
              the secondary panels follow as a collapsed accordion and never
              push the composer down. */}
          <PromptComposer
            draft={draft}
            onDraftChange={setDraft}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onAttachPath={addAttachment}
            onAttachFiles={(files) => void handleAttachFiles(files)}
            onSubmit={() => void handleSend()}
            onStop={handleStop}
            busy={sending}
            runActive={run.status === "active"}
            agents={agents}
            models={models}
            currentAgent={currentAgent}
            currentModelValue={currentModelValue}
            onAgentChange={(value) => void handleAgentChange(value)}
            onModelChange={(value) => void handleModelChange(value)}
            switching={switching}
          />
          {/* Secondary panels behind one "Mehr…" disclosure: chat + composer
              dominate, everything else is one tap away (one tab at a time). */}
          <div data-testid="session-panels">
            <section className="card bg-base-200 shadow" data-testid="session-more">
              <div className="card-body py-3">
                <div className="flex items-center gap-2">
                  <h2 className="card-title text-base flex-1">
                    <Trans>Mehr…</Trans>
                  </h2>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-expanded={moreOpen}
                    aria-label={moreOpen ? t`Werkzeuge ausblenden` : t`Mehr anzeigen`}
                    data-testid="session-more-toggle"
                    onClick={() => setMoreOpen((open) => !open)}
                  >
                    {moreOpen ? <Trans>Ausblenden</Trans> : <Trans>Anzeigen</Trans>}
                  </button>
                </div>
                {moreOpen && (
                  <>
                    <div
                      className="tabs tabs-boxed w-fit max-w-full overflow-x-auto"
                      role="tablist"
                      aria-label={t`Werkzeuge`}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "stats"}
                        data-testid="session-more-tab-stats"
                        className={moreTab === "stats" ? "tab tab-active" : "tab"}
                        onClick={() => selectMoreTab("stats")}
                      >
                        <Trans>Verbrauch</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "diff"}
                        data-testid="session-more-tab-diff"
                        className={moreTab === "diff" ? "tab tab-active" : "tab"}
                        disabled={!canDiff}
                        onClick={() => selectMoreTab("diff")}
                      >
                        <Trans>Änderungen</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "revert"}
                        data-testid="session-more-tab-revert"
                        className={moreTab === "revert" ? "tab tab-active" : "tab"}
                        onClick={() => selectMoreTab("revert")}
                      >
                        <Trans>Revert</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "share"}
                        data-testid="session-more-tab-share"
                        className={moreTab === "share" ? "tab tab-active" : "tab"}
                        onClick={() => selectMoreTab("share")}
                      >
                        <Trans>Teilen</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "command"}
                        data-testid="session-more-tab-command"
                        className={moreTab === "command" ? "tab tab-active" : "tab"}
                        onClick={() => selectMoreTab("command")}
                      >
                        <Trans>Befehl</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "inbox"}
                        data-testid="session-more-tab-inbox"
                        className={moreTab === "inbox" ? "tab tab-active" : "tab"}
                        disabled={!canInbox}
                        onClick={() => selectMoreTab("inbox")}
                      >
                        <Trans>Eingangsbox</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "forms"}
                        data-testid="session-more-tab-forms"
                        className={moreTab === "forms" ? "tab tab-active" : "tab"}
                        disabled={!canFormList}
                        onClick={() => selectMoreTab("forms")}
                      >
                        <Trans>Formulare</Trans>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={moreTab === "terminal"}
                        data-testid="session-more-tab-terminal"
                        className={moreTab === "terminal" ? "tab tab-active" : "tab"}
                        disabled={!canTerminal}
                        onClick={() => selectMoreTab("terminal")}
                      >
                        <Trans>Terminal</Trans>
                      </button>
                    </div>
                    <div role="tabpanel" data-testid={`session-more-panel-${moreTab}`}>
                      {moreTab === "stats" && (
                        <section aria-label={t`Verbrauch dieser Session`} data-testid="session-stats">
              {sessionTokens === null && sessionCost === null ? (
                <p className="opacity-70 text-sm">
                  <Trans>Noch keine Verbrauchsdaten vorhanden.</Trans>
                </p>
              ) : (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Eingabe:</Trans>
                    </dt>
                    <dd className="font-mono" data-testid="session-stats-input">
                      {statInput}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Ausgabe:</Trans>
                    </dt>
                    <dd className="font-mono" data-testid="session-stats-output">
                      {statOutput}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Denken:</Trans>
                    </dt>
                    <dd className="font-mono">{statReasoning}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Cache (lesen/schreiben):</Trans>
                    </dt>
                    <dd className="font-mono">
                      {statCacheRead}/{statCacheWrite}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="opacity-70">
                      <Trans>Kosten:</Trans>
                    </dt>
                    <dd className="font-mono" data-testid="session-stats-cost">
                      {statCost}
                    </dd>
                  </div>
                </dl>
              )}
              {globalStats !== null && (
                <p className="text-xs opacity-70">
                  {totalToolCalls === null ? (
                    <Trans>
                      Gesamt (alle Sessions): {totalPrompts} Prompts, {totalSteps} Schritte
                    </Trans>
                  ) : (
                    <Trans>
                      Gesamt (alle Sessions): {totalPrompts} Prompts, {totalSteps} Schritte,{" "}
                      {totalToolCalls} Werkzeugaufrufe
                    </Trans>
                  )}
                </p>
              )}
                        </section>
                      )}
                      {moreTab === "diff" && (
                        <section aria-label={t`Dateiänderungen`} data-testid="session-diff-section">
                  {diffLoading && (
                    <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />
                  )}
                  {diffError !== null && (
                    <div className="alert alert-warning" data-testid="session-diff-error">
                      <span>
                        <Trans>Diffs konnten nicht geladen werden: {diffError}</Trans>
                      </span>
                    </div>
                  )}
                  {!diffLoading && diffError === null && diffRows !== null && (
                    <SessionDiffView
                      rows={diffRows}
                      projects={projects}
                      projectKey={sessionProjectKey}
                      onInitGit={askInitGit}
                      initGitBusy={initGitBusy}
                    />
                  )}
                        </section>
                      )}
                      {moreTab === "revert" && (
                        <section
                          aria-label={t`Zurücksetzen (Revert)`}
                          data-testid="session-revert-section"
                        >
              <p className="text-xs opacity-70">
                <Trans>
                  Erst staging starten (ab einer Nachricht), dann übernehmen oder verwerfen. Das
                  Übernehmen ändert Nachrichten und Dateien unwiderruflich.
                </Trans>
              </p>
              {stagedRevert === null ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleStageRevert();
                  }}
                >
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={revertMessageID}
                    onChange={(e) => setRevertMessageID(e.target.value)}
                    disabled={!canRevert || revertBusy}
                    aria-label={t`Nachricht für das Revert`}
                    data-testid="revert-message-select"
                  >
                    <option value="">
                      <Trans>Nachricht wählen …</Trans>
                    </option>
                    {visible.map((m) => (
                      <option key={m.messageID} value={m.messageID}>
                        {`${m.role === "user" ? t`Benutzer` : m.role === "assistant" ? t`Assistent` : t`Notiz`}: ${
                          m.text === "" ? t`unbekannter Inhalt` : m.text.slice(0, 80)
                        }`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn btn-sm"
                    disabled={!canRevert || revertBusy || revertMessageID === ""}
                    aria-label={t`Revert-Staging starten`}
                  >
                    <Trans>Staging starten</Trans>
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2" data-testid="revert-staged">
                  <span className="text-sm flex-1">
                    {stagedFileCount === null ? (
                      <Trans>Staged ab Nachricht {stagedMessageID}.</Trans>
                    ) : (
                      <Trans>
                        Staged ab Nachricht {stagedMessageID} ({stagedFileCount} Dateien).
                      </Trans>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-error"
                    disabled={!canRevert || revertBusy}
                    aria-label={t`Revert übernehmen`}
                    onClick={() => setConfirm("revert-commit")}
                  >
                    <Trans>Übernehmen</Trans>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={!canRevert || revertBusy}
                    aria-label={t`Revert-Staging verwerfen`}
                    onClick={() => void handleClearRevert()}
                  >
                    <Trans>Verwerfen</Trans>
                  </button>
                </div>
              )}
                        </section>
                      )}
                      {moreTab === "share" && (
                        <section
                          aria-label={t`Teilen (Export / Import)`}
                          data-testid="session-share-section"
                        >
              <p className="text-xs opacity-70">
                <Trans>
                  Export als JSON teilen, Import als neue Session übernehmen.
                </Trans>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!canExport || shareBusy}
                  aria-label={t`Session exportieren`}
                  data-testid="session-export-button"
                  onClick={() => void handleExport()}
                >
                  <Trans>Exportieren</Trans>
                </button>
                {exportText !== null && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={t`Export als Datei laden`}
                    onClick={downloadExport}
                  >
                    <Trans>Als Datei laden</Trans>
                  </button>
                )}
              </div>
              {exportText !== null && (
                <textarea
                  className="textarea textarea-bordered font-mono text-xs w-full"
                  rows={6}
                  readOnly
                  value={exportText}
                  aria-label={t`Exportiertes JSON`}
                  data-testid="session-export-text"
                />
              )}
              <h3 className="font-semibold text-sm">
                <Trans>Importieren</Trans>
              </h3>
              <input
                type="file"
                accept="application/json,.json"
                className="file-input file-input-bordered file-input-sm w-full"
                disabled={!canImport}
                aria-label={t`Exportdatei wählen`}
                data-testid="session-import-file"
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
              <textarea
                className="textarea textarea-bordered font-mono text-xs w-full"
                rows={4}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={t`Export-JSON hier einfügen …`}
                aria-label={t`Export-JSON`}
                disabled={!canImport}
                data-testid="session-import-text"
              />
              <button
                type="button"
                className="btn btn-sm btn-primary w-fit"
                disabled={!canImport || importBusy || importText.trim() === ""}
                aria-label={t`Session importieren`}
                data-testid="session-import-button"
                onClick={() => void handleImport()}
              >
                <Trans>Importieren</Trans>
              </button>
                        </section>
                      )}
                      {moreTab === "command" && (
                        <section
                          aria-label={t`Befehl ausführen`}
                          data-testid="session-command-section"
                        >
              <div className="flex flex-wrap gap-2">
                <select
                  className="select select-bordered select-sm flex-1"
                  value={commandName}
                  onChange={(e) => setCommandName(e.target.value)}
                  disabled={!canRunCommand || commandBusy}
                  aria-label={t`Befehl`}
                  data-testid="session-command-select"
                >
                  <option value="">
                    <Trans>Befehl wählen …</Trans>
                  </option>
                  {commands.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.description === null ? c.name : `${c.name} – ${c.description}`}
                    </option>
                  ))}
                </select>
                <input
                  className="input input-bordered input-sm flex-1"
                  value={commandText}
                  onChange={(e) => setCommandText(e.target.value)}
                  placeholder={t`Zusatztext für den Befehl`}
                  aria-label={t`Befehlstext`}
                  disabled={!canRunCommand || commandBusy}
                  data-testid="session-command-text"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!canRunCommand || commandBusy || commandName === ""}
                  aria-label={t`Befehl ausführen`}
                  data-testid="session-command-run"
                  onClick={() => void handleRunCommand()}
                >
                  <Trans>Ausführen</Trans>
                </button>
              </div>
                        </section>
                      )}
                      {moreTab === "inbox" && (
                        <section aria-label={t`Eingangsbox`} data-testid="session-inbox-section">
                          <p className="text-xs opacity-70">
                            <Trans>
                              Einträge in der Warteschlange dieser Session. Beantwortet wird über
                              Formulare und Berechtigungen – hier kann die Zustellung umgestellt
                              (sofort oder warten) oder abgebrochen werden.
                            </Trans>
                          </p>
                  {inboxLoading && (
                    <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />
                  )}
                  {inboxError !== null && (
                    <div className="alert alert-warning">
                      <span>{inboxError}</span>
                    </div>
                  )}
                  {!inboxLoading && inboxError === null && inboxRows !== null && inboxRows.length === 0 && (
                    <p className="opacity-70 text-sm">
                      <Trans>Keine Einträge in der Warteschlange.</Trans>
                    </p>
                  )}
                  {!inboxLoading && inboxError === null && inboxRows !== null && inboxRows.length > 0 && (
                    <ul className="flex flex-col gap-2" data-testid="session-inbox-list">
                      {inboxRows.map((row) => {
                        const inboxRowID = row.id;
                        return (
                          <li key={inboxRowID} data-testid={`session-inbox-${inboxRowID}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="badge badge-ghost badge-sm">{row.kind}</span>
                              {row.delivery !== null && (
                                <span
                                  className="badge badge-info badge-sm"
                                  data-testid={`session-inbox-delivery-${inboxRowID}`}
                                >
                                  {row.delivery === "steer" ? <Trans>sofort</Trans> : <Trans>Warteschlange</Trans>}
                                </span>
                              )}
                              <span className="flex-1 break-all text-sm">{row.summary}</span>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                disabled={!canInboxUpdate || cancellingInbox !== null || updatingInbox !== null}
                                aria-label={t`Eintrag ${inboxRowID} sofort ausführen`}
                                data-testid={`session-inbox-steer-${inboxRowID}`}
                                onClick={() => void handleUpdateInbox(inboxRowID, "steer")}
                              >
                                <Trans>Sofort</Trans>
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                disabled={!canInboxUpdate || cancellingInbox !== null || updatingInbox !== null}
                                aria-label={t`Eintrag ${inboxRowID} in die Warteschlange legen`}
                                data-testid={`session-inbox-queue-${inboxRowID}`}
                                onClick={() => void handleUpdateInbox(inboxRowID, "queue")}
                              >
                                <Trans>Warten</Trans>
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-error btn-outline"
                                disabled={!canInboxCancel || cancellingInbox !== null}
                                aria-label={t`Eintrag ${inboxRowID} abbrechen`}
                                onClick={() => void handleCancelInbox(inboxRowID)}
                              >
                                <Trans>Abbrechen</Trans>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                        </section>
                      )}
                      {moreTab === "forms" && (
                        <section aria-label={t`Offene Formulare`} data-testid="session-forms-section">
                          <p className="text-xs opacity-70">
                            <Trans>
                              Fragen des Servers an dich. Die Antwort ist ein JSON-Objekt mit einem
                              Eintrag pro Feld (Text, Zahl, Ja/Nein oder Textliste).
                            </Trans>
                          </p>
                  {formsLoading && (
                    <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />
                  )}
                  {!formsLoading && formRows !== null && formRows.length === 0 && (
                    <p className="opacity-70 text-sm">
                      <Trans>Keine offenen Formulare.</Trans>
                    </p>
                  )}
                  {!formsLoading && formRows !== null && formRows.length > 0 && (
                    <div className="flex flex-col gap-2" data-testid="session-forms-list">
                      <ul className="menu gap-1">
                        {formRows.map((row) => {
                          const formRowID = row.id;
                          return (
                            <li key={formRowID} data-testid={`session-form-${formRowID}`}>
                              <span className="break-all text-sm">{row.title}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <select
                        className="select select-bordered select-sm w-full"
                        value={selectedFormID}
                        onChange={(e) => setSelectedFormID(e.target.value)}
                        aria-label={t`Formular`}
                        data-testid="session-form-select"
                      >
                        <option value="">
                          <Trans>Formular wählen …</Trans>
                        </option>
                        {formRows.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.title}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="textarea textarea-bordered font-mono text-xs w-full"
                        rows={3}
                        value={formAnswerText}
                        onChange={(e) => setFormAnswerText(e.target.value)}
                        placeholder={t`Antwort als JSON-Objekt, z. B. {"ok": true}`}
                        aria-label={t`Antwort als JSON`}
                        data-testid="session-form-answer"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={selectedFormID === "" || formBusy || !canFormReply}
                          aria-label={t`Formular beantworten`}
                          data-testid="session-form-reply"
                          onClick={() => void handleReplyForm()}
                        >
                          <Trans>Antworten</Trans>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-error btn-outline"
                          disabled={selectedFormID === "" || formBusy || !canFormCancel}
                          aria-label={t`Formular ablehnen`}
                          data-testid="session-form-cancel"
                          onClick={() => void handleCancelForm()}
                        >
                          <Trans>Ablehnen</Trans>
                        </button>
                      </div>
                    </div>
                  )}
                        </section>
                      )}
                      {moreTab === "terminal" && (
                        <section aria-label={t`Terminal`} data-testid="session-terminal-section">
                          {terminalLoaded && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                disabled={!canTerminal || terminalLoading}
                                aria-label={t`Terminal-Ausgabe aktualisieren`}
                                data-testid="session-terminal-refresh"
                                onClick={() => void loadTerminal()}
                              >
                                <Trans>Aktualisieren</Trans>
                              </button>
                            </div>
                          )}
                          <p className="text-xs opacity-70">
                            <Trans>
                              Nur lesend: Bildschirminhalt des Session-Terminals als Text. Ohne
                              Emulator, ohne Eingabe.
                            </Trans>
                          </p>
                  {terminalLoading && (
                    <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />
                  )}
                  {terminalError !== null && (
                    <div className="alert alert-warning">
                      <span>{terminalError}</span>
                    </div>
                  )}
                  {!terminalLoading && terminalError === null && terminalLoaded && terminalScreen === null && (
                    <p className="opacity-70 text-sm">
                      <Trans>Kein Terminal für diese Session.</Trans>
                    </p>
                  )}
                  {!terminalLoading && terminalError === null && terminalScreen !== null && (
                    <>
                      {terminalScreen.title !== null && (
                        <p className="text-xs opacity-70 break-all" data-testid="session-terminal-title">
                          {terminalScreen.title} ({terminalScreen.columns}×{terminalScreen.rows})
                        </p>
                      )}
                      <pre
                        className="text-xs bg-base-300 rounded p-2 whitespace-pre-wrap break-words max-h-72 overflow-auto"
                        data-testid="session-terminal-output"
                      >
                        {terminalScreen.text === "" ? t`Leeres Terminal.` : terminalScreen.text}
                      </pre>
                    </>
                  )}
                        </section>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === "delete"
            ? t`Session löschen`
            : confirm === "fork"
              ? t`Session forken`
              : confirm === "compact"
                ? t`Session kompaktieren`
                : confirm === "revert-commit"
                  ? t`Revert übernehmen`
                  : confirm === "init-git"
                    ? t`Git-Repository erstellen`
                    : t`Ausführung unterbrechen`
        }
        message={
          confirm === "delete"
            ? t`Die Session wird endgültig gelöscht. Fortfahren?`
            : confirm === "fork"
              ? t`Die Session wird ab dem aktuellen Stand kopiert. Die neue Session öffnet sich danach automatisch. Fortfahren?`
              : confirm === "compact"
                ? t`Der Kontext wird zusammengefasst, um Platz zu schaffen. Fortfahren?`
                : confirm === "revert-commit"
                  ? t`Das gestagete Revert wird übernommen. Nachrichten und Dateien nach dem gewählten Stand gehen verloren. Fortfahren?`
                  : confirm === "init-git"
                    ? t`Im Projektverzeichnis des Servers wird ein Git-Repository angelegt. Danach kann der Server die Änderungen dieser Session verfolgen. Fortfahren?`
                    : t`Die laufende Ausführung wird unterbrochen. Die Session selbst bleibt erhalten. Fortfahren?`
        }
        confirmLabel={
          confirm === "delete"
            ? t`Löschen`
            : confirm === "fork"
              ? t`Forken`
              : confirm === "compact"
                ? t`Kompaktieren`
                : confirm === "revert-commit"
                  ? t`Übernehmen`
                  : confirm === "init-git"
                    ? t`Erstellen`
                    : t`Unterbrechen`
        }
        busy={confirmBusy}
        // Always null on purpose: the confirm *question* lives here, the
        // outcome (success or error) is a toast once the dialog closes.
        error={null}
        onConfirm={() => void handleConfirm()}
        onCancel={() => {
          if (!confirmBusy) {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
