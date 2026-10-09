import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useMemo, useReducer, useState } from "react";
import Icon from "./Icon.tsx";
import SessionRowMarkers from "./SessionRowMarkers.tsx";
import {
  EMPTY_SEARCH_OVERLAY,
  searchKeyAction,
  searchOverlayReducer,
} from "../lib/sessionSearchOverlay.ts";
import { listSessionsPaged, type ServerConfig } from "../lib/opencode.ts";
import {
  useOpenSessionTabs,
  useSessionSearch,
  useSessionUnread,
} from "../hooks/useSessionSearch.ts";

export interface SessionSearchOverlayProps {
  server: ServerConfig | null | undefined;
  /** Scope the search to one project (server-side filter), when set. */
  project?: string | null;
  value: string;
  onValueChange: (value: string) => void;
  /** Open a session (registers its tab and navigates). */
  onOpenSession: (sessionID: string) => void;
  disabled?: boolean;
  /** Prefix for every generated testid (`<testId>-input`, `-panel`, …). */
  testId?: string;
  /** Testid of the input itself; defaults to `<testId>-input`. */
  inputTestId?: string;
}

/**
 * Search overlay over the session list.
 *
 * The query is answered server-side through the same paged list call the list
 * itself uses (`GET /api/session` with `search`/`limit`/`cursor`). While a
 * request is in flight the panel shows its spinner; the result list is keyboard
 * navigable (up/down with wrap-around, Enter opens, Escape closes) and carries
 * the same open-tab / unread markers as the list rows underneath.
 *
 * On a 360px viewport the panel spans the full width of the list card and
 * stacks its rows vertically — never a horizontal scroller.
 */
export default function SessionSearchOverlay({
  server,
  project = null,
  value,
  onValueChange,
  onOpenSession,
  disabled = false,
  testId = "session-search",
  inputTestId = `${testId}-input`,
}: SessionSearchOverlayProps) {
  const [nav, dispatchNav] = useReducer(searchOverlayReducer, EMPTY_SEARCH_OVERLAY);
  const [focused, setFocused] = useState(false);
  const open = nav.open && value.trim() !== "";
  const activeProject = project ?? null;

  const { hits, loading, error } = useSessionSearch(
    server,
    value,
    open,
    activeProject,
    async (activeServer, options) => {
      const result = await listSessionsPaged(activeServer, options);
      if (result.error !== null || result.data === null) {
        return { rows: [], error: result.error ?? t`Suche fehlgeschlagen.` };
      }
      return {
        rows: result.data.rows.map((row) => ({ id: row.id, label: row.label })),
        error: null,
      };
    },
  );

  // Keep the navigation state in sync with what the result list currently holds.
  useEffect(() => {
    dispatchNav({ type: "results", count: hits.length, loading });
  }, [hits.length, loading]);

  const hitIDs = useMemo(() => hits.map((hit) => hit.id), [hits]);
  const openTabs = useOpenSessionTabs();
  const unread = useSessionUnread(server, hitIDs, null);

  function activate(index: number) {
    const hit = hits[index];
    if (hit === undefined) return;
    dispatchNav({ type: "close" });
    onOpenSession(hit.id);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const action = searchKeyAction(event.key, nav, {
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    if (action === "close") {
      event.preventDefault();
      dispatchNav({ type: "close" });
      onValueChange("");
      event.currentTarget.blur();
      return;
    }
    if (action === "down") {
      event.preventDefault();
      dispatchNav({ type: "move", delta: 1 });
      return;
    }
    if (action === "up") {
      event.preventDefault();
      dispatchNav({ type: "move", delta: -1 });
      return;
    }
    if (action === "select") {
      event.preventDefault();
      activate(nav.activeIndex);
    }
  }

  return (
    <div className="relative w-full min-w-0" data-component="session-search">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="search" className="size-4 opacity-70" />
          <span className="sr-only">
            <Trans>Sessions suchen</Trans>
          </span>
          <input
            className="input input-bordered input-sm flex-1 min-w-0"
            value={value}
            placeholder={t`Titel oder ID suchen`}
            aria-label={t`Sessions suchen`}
            aria-expanded={open}
            aria-autocomplete="list"
            role="combobox"
            aria-controls={`${testId}-results`}
            aria-activedescendant={
              open && nav.activeIndex >= 0 ? `${testId}-option-${nav.activeIndex}` : undefined
            }
            disabled={disabled}
            data-testid={inputTestId}
            onFocus={() => {
              setFocused(true);
              dispatchNav({ type: "open" });
            }}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              onValueChange(event.target.value);
              dispatchNav({ type: "open" });
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        {value !== "" && (
          <button
            type="button"
            className="btn btn-xs btn-ghost shrink-0"
            aria-label={t`Suche zurücksetzen`}
            data-testid={`${testId}-clear`}
            // Keep the input focused: clearing must not blur the search (the
            // panel would close before the click lands).
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onValueChange("");
              dispatchNav({ type: "reset" });
            }}
          >
            <Icon name="close" className="size-3" />
          </button>
        )}
      </div>
      {open && focused && (
        <div
          id={`${testId}-results`}
          role="listbox"
          aria-label={t`Suchergebnisse`}
          className="absolute z-30 left-0 right-0 top-full mt-1 max-h-80 overflow-auto rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg flex flex-col gap-1"
          data-testid={`${testId}-panel`}
        >
          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm opacity-70">
              <span className="loading loading-spinner loading-sm" aria-label={t`Lädt`} />
              <Trans>Suche läuft …</Trans>
            </div>
          )}
          {!loading && error !== null && (
            <p className="text-sm text-error py-2" data-testid={`${testId}-error`}>
              {error}
            </p>
          )}
          {!loading && error === null && hits.length === 0 && (
            <p className="text-sm opacity-70 py-2" data-testid={`${testId}-empty`}>
              <Trans>Keine Sessions für diese Suche.</Trans>
            </p>
          )}
          {!loading &&
            hits.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                id={`${testId}-option-${index}`}
                role="option"
                aria-selected={nav.activeIndex === index}
                className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                  nav.activeIndex === index ? "bg-base-300" : "hover:bg-base-200"
                }`}
                data-testid={`${testId}-result-${hit.id}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => activate(index)}
              >
                <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                <SessionRowMarkers open={openTabs.has(hit.id)} unread={unread.has(hit.id)} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
