import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { serverColor } from "../lib/serverColor.ts";
import { renameSession } from "../lib/opencode.ts";
import { resolveTabIndex, tabShortcutIndex } from "../lib/tabShortcuts.ts";
import { useServers } from "../state/servers.tsx";
import { useSessionTabs } from "../state/sessionTabs.tsx";
import { useToast } from "../state/toast.tsx";

/**
 * Tab bar for open sessions from different servers side by side. Each tab
 * binds serverID+sessionID; the label is the session title plus a dot in the
 * server color. Horizontally scrollable (mobile-first) with smooth scrolling;
 * the active tab scrolls into view. Rendered above the page content in
 * `Layout`; pure localStorage state, so it renders the cached tab list even
 * while every server is offline.
 *
 * The bar always renders: with no tabs open only the "+ Neu" shortcut to the
 * session starter (`/`) is shown. The "+" button is always visible next to the
 * bar, so a new session can be started from anywhere.
 *
 * Overflow path: when the tabs exceed the bar width (mobile + narrow
 * desktop), an "Alle Tabs" button appears next to the scrollable bar and
 * opens a dropdown listing every tab (server color dot + title). The
 * horizontal scroll stays as-is; the popup is the overflow shortcut. The
 * button only renders while the bar actually overflows (ResizeObserver +
 * scrollWidth check).
 *
 * Wave 5 gestures (parity with the original's titlebar tabs):
 *   - middle click closes a tab (`onAuxClick`, button 1)
 *   - double click renames a tab inline (`renameSession` + optimistic
 *     `retitleTab`, toast on failure)
 *   - Cmd/Ctrl+1…9 switches to the nth tab
 * Every existing behaviour (close, close all, overflow) and every existing
 * testid stays exactly as it was.
 */
export default function SessionTabBar() {
  const { tabs, closeTab, closeAllTabs, retitleTab } = useSessionTabs();
  const { servers } = useServers();
  const { notify } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const activeRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Inline rename: exactly one tab is edited at a time. The input replaces the
  // link inside the same row, so the bar's height never changes.
  const [renaming, setRenaming] = useState<{ serverID: string; sessionID: string } | null>(null);
  const [renameText, setRenameText] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const sessionMatch = location.pathname.match(/^\/sessions\/([^/]+)$/);
  const activeSessionID = sessionMatch?.[1] !== undefined
    ? decodeURIComponent(sessionMatch[1])
    : null;
  const activeServerID = new URLSearchParams(location.search).get("server");
  const pathname = location.pathname;
  const searchString = location.search;

  function isActiveTab(serverID: string, sessionID: string): boolean {
    if (activeSessionID === null || sessionID !== activeSessionID) return false;
    if (activeServerID !== null) return serverID === activeServerID;
    return true;
  }

  // Keep the active tab visible when switching tabs or opening new ones —
  // with many tabs the bar scrolls horizontally and the active one may sit
  // outside the viewport.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSessionID, activeServerID, tabs.length]);

  // Overflow detection: only offer the popup button while the tab row
  // actually exceeds the visible bar width.
  useEffect(() => {
    const el = navRef.current;
    if (el === null) return;
    const update = () => {
      setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [tabs.length, activeSessionID, activeServerID]);

  // Close the overflow menu on every navigation (item click navigates).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, searchString]);

  // Close the overflow menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const wrap = menuWrapRef.current;
      if (wrap !== null && event.target instanceof Node && !wrap.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Cmd/Ctrl+1…9: switch to the nth tab (rule in `tabShortcuts.ts`).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const index = tabShortcutIndex(event.key, event.metaKey, event.ctrlKey);
      const resolved = resolveTabIndex(index, tabs.length);
      if (resolved === null) return;
      const target = tabs[resolved];
      if (target === undefined) return;
      event.preventDefault();
      navigate(`/sessions/${encodeURIComponent(target.sessionID)}?server=${encodeURIComponent(target.serverID)}`);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabs, navigate]);

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

  function handleCloseAll() {
    const closingActive = activeSessionID !== null;
    closeAllTabs();
    // Leaving a session view with no tabs left: back to the dashboard.
    if (closingActive) navigate("/");
  }

  function startRename(serverID: string, sessionID: string, title: string) {
    setRenameText(title);
    setRenaming({ serverID, sessionID });
  }

  /**
   * Inline rename of a tab: optimistic `retitleTab` first (the label switches
   * at once), then the server PATCH. On failure the previous title comes back
   * and the error surfaces as a toast — never a blocking dialog.
   */
  async function commitRename() {
    if (renaming === null) return;
    const next = renameText.trim();
    if (next === "" || renameBusy) {
      setRenaming(null);
      return;
    }
    const { serverID, sessionID } = renaming;
    const previous = tabs.find((tab) => tab.serverID === serverID && tab.sessionID === sessionID)?.title ?? sessionID;
    const target = servers.find((s) => s.id === serverID);
    if (target === undefined) {
      setRenaming(null);
      notify(t`Server dieses Tabs ist nicht mehr eingerichtet.`, "error");
      return;
    }
    setRenaming(null);
    setRenameBusy(true);
    retitleTab(serverID, sessionID, next);
    const result = await renameSession(target, sessionID, next);
    setRenameBusy(false);
    if (result.error !== null) {
      retitleTab(serverID, sessionID, previous);
      const renameError = result.error;
      notify(t`Umbenennen fehlgeschlagen: ${renameError}`, "error");
      return;
    }
    notify(t`Tab umbenannt.`, "success");
  }

  const serverById = new Map(servers.map((s) => [s.id, s]));

  return (
    <div className="flex items-stretch border-b border-base-300">
      <nav ref={navRef} aria-label={t`Offene Sessions`} className="min-w-0 flex-1 overflow-x-auto scroll-smooth">
        <ul className="oc-dense flex gap-1 px-4 pt-2" role="tablist" data-testid="session-tab-bar">
          {tabs.map((tab) => {
            const active = isActiveTab(tab.serverID, tab.sessionID);
            const server = serverById.get(tab.serverID);
            const color = server !== undefined ? serverColor(server) : undefined;
            const editing =
              renaming !== null &&
              renaming.serverID === tab.serverID &&
              renaming.sessionID === tab.sessionID;
            // Lingui-safe hoist: no member access inside the message.
            const tabTitle = tab.title;
            const closeLabel = t`Tab ${tabTitle} schließen`;
            return (
              <li key={`${tab.serverID}::${tab.sessionID}`} role="presentation" className="shrink-0">
                <div
                  role="tab"
                  aria-selected={active}
                  data-testid={`session-tab-${tab.sessionID}`}
                  data-editing={editing ? "true" : undefined}
                  ref={active ? activeRef : undefined}
                  className={`oc-dense flex max-w-56 items-center gap-1.5 rounded-t-lg border border-b-0 px-2 py-1.5 ${
                    active
                      ? "border-base-300 bg-base-200 font-semibold shadow-sm"
                      : "border-transparent opacity-70 hover:bg-base-200 hover:opacity-100"
                  }`}
                  style={active && color !== undefined ? { borderTop: `2px solid ${color}` } : undefined}
                  onMouseDown={(event) => {
                    // Middle button: close (and never start a text selection)
                    if (event.button !== 1) return;
                    event.preventDefault();
                  }}
                  onAuxClick={(event) => {
                    if (event.button !== 1) return;
                    handleClose(tab.serverID, tab.sessionID);
                  }}
                >
                  {color !== undefined && (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                      data-testid={`session-tab-dot-${tab.sessionID}`}
                    />
                  )}
                  {editing ? (
                    <span className="flex items-center h-6 min-w-0">
                      <input
                        className="input input-xs h-6 w-32 min-w-0 rounded border-base-300 bg-base-100"
                        value={renameText}
                        autoFocus
                        aria-label={t`Neuer Tab-Titel`}
                        placeholder={t`Titel eingeben …`}
                        data-testid={`session-tab-rename-${tab.sessionID}`}
                        onChange={(event) => setRenameText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitRename();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setRenaming(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-xs btn-primary shrink-0 ml-1"
                        disabled={renameBusy || renameText.trim() === ""}
                        aria-label={t`Tab-Titel speichern`}
                        data-testid={`session-tab-rename-save-${tab.sessionID}`}
                        onClick={() => void commitRename()}
                      >
                        <Trans>OK</Trans>
                      </button>
                    </span>
                  ) : (
                    <Link
                      className="min-w-0 flex-1 truncate"
                      to={`/sessions/${encodeURIComponent(tab.sessionID)}?server=${encodeURIComponent(tab.serverID)}`}
                      title={server !== undefined ? `${tab.title} (${server.name})` : tab.title}
                      onDoubleClick={() => startRename(tab.serverID, tab.sessionID, tab.title)}
                    >
                      {tab.title}
                    </Link>
                  )}
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
          {tabs.length > 1 && (
            <li role="presentation" className="shrink-0 self-center">
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                aria-label={t`Alle Tabs schließen`}
                title={t`Alle Tabs schließen`}
                data-testid="session-tabs-close-all"
                onClick={handleCloseAll}
              >
                <Trans>Alle schließen</Trans>
              </button>
            </li>
          )}
        </ul>
      </nav>
      <div ref={menuWrapRef} className="relative flex shrink-0 items-center gap-1 px-2">
        <Link
          to="/"
          className="btn btn-xs btn-ghost"
          aria-label={t`Neue Session`}
          title={t`Neue Session öffnen`}
          data-testid="session-tab-new"
        >
          <Trans>+ Neu</Trans>
        </Link>
        {hasOverflow && (
          <>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t`Alle Tabs anzeigen`}
              title={t`Alle Tabs anzeigen`}
              data-testid="session-tabs-overflow-button"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Trans>Alle Tabs</Trans>
              <span aria-hidden="true">{menuOpen ? "▴" : "▾"}</span>
            </button>
            {menuOpen && (
              <ul
                role="menu"
                aria-label={t`Alle Tabs`}
                data-testid="session-tabs-overflow-menu"
                className="menu absolute top-full right-0 z-20 max-h-80 w-72 gap-1 overflow-auto rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
              >
                {tabs.map((tab) => {
                  const server = serverById.get(tab.serverID);
                  const color = server !== undefined ? serverColor(server) : undefined;
                  const active = isActiveTab(tab.serverID, tab.sessionID);
                  return (
                    <li key={`${tab.serverID}::${tab.sessionID}`} role="presentation">
                      <Link
                        role="menuitem"
                        aria-current={active ? "true" : undefined}
                        data-testid={`session-tabs-overflow-item-${tab.sessionID}`}
                        className={`flex min-w-0 items-center gap-2 ${active ? "active" : ""}`}
                        to={`/sessions/${encodeURIComponent(tab.sessionID)}?server=${encodeURIComponent(tab.serverID)}`}
                        title={server !== undefined ? `${tab.title} (${server.name})` : tab.title}
                        onClick={() => setMenuOpen(false)}
                      >
                        {color !== undefined && (
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                            data-testid={`session-tabs-overflow-dot-${tab.sessionID}`}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
