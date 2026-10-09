/**
 * Keyboard navigation of the session search overlay.
 *
 * Mirrors the original Opencode web UI (`home-sessions-view.tsx`, search panel):
 * up/down walk the result list with wrap-around, Enter opens the highlighted
 * row, Escape closes the overlay, and a clear button resets the query. Pure and
 * unit-testable — the component only maps DOM events onto these actions.
 */

export interface SearchOverlayState {
  /** Overlay is open (input focused + a query is being typed). */
  open: boolean;
  /** Number of results currently listed (0 while empty or loading). */
  count: number;
  /** Highlighted row index, -1 when nothing is highlighted. */
  activeIndex: number;
  /** A search request is in flight (the overlay shows its spinner). */
  loading: boolean;
}

export const EMPTY_SEARCH_OVERLAY: SearchOverlayState = {
  open: false,
  count: 0,
  activeIndex: -1,
  loading: false,
};

export type SearchOverlayAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "results"; count: number; loading: boolean }
  | { type: "move"; delta: number }
  | { type: "reset" };

/** Wrap an index into `[0, count)`; returns -1 for an empty list. */
export function wrapSearchIndex(count: number, index: number): number {
  if (count <= 0) return -1;
  const wrapped = ((index % count) + count) % count;
  return wrapped;
}

/** The search overlay reducer (total). */
export function searchOverlayReducer(
  state: SearchOverlayState,
  action: SearchOverlayAction,
): SearchOverlayState {
  switch (action.type) {
    case "open":
      return { ...state, open: true };
    case "close":
      return { ...state, open: false, activeIndex: -1 };
    case "results": {
      const count = action.count;
      if (count === 0) return { ...state, count, activeIndex: -1, loading: action.loading };
      // A fresh query resets the highlight; a shrinking list keeps it valid.
      const activeIndex = wrapSearchIndex(count, state.activeIndex);
      return { ...state, count, activeIndex, loading: action.loading };
    }
    case "move": {
      if (!state.open || state.count === 0) return state;
      const base = state.activeIndex < 0 ? (action.delta > 0 ? -1 : 0) : state.activeIndex;
      return { ...state, activeIndex: wrapSearchIndex(state.count, base + action.delta) };
    }
    case "reset":
      return { ...EMPTY_SEARCH_OVERLAY, open: state.open };
  }
}

export type SearchKeyAction = "up" | "down" | "select" | "close" | "none";

/**
 * Map one keydown onto a navigation action. Arrows and Enter only act while the
 * overlay is open and has results (so a plain query keystroke is never
 * swallowed); Escape always closes.
 */
export function searchKeyAction(
  key: string,
  state: SearchOverlayState,
  modifiers: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
): SearchKeyAction {
  if (modifiers.altKey === true || modifiers.ctrlKey === true || modifiers.metaKey === true) {
    return "none";
  }
  if (key === "Escape") return state.open ? "close" : "none";
  if (!state.open || state.count === 0) return "none";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowUp") return "up";
  if (key === "Enter") return "select";
  return "none";
}
