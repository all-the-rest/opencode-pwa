import { describe, expect, it } from "vitest";
import {
  EMPTY_SEARCH_OVERLAY,
  searchKeyAction,
  searchOverlayReducer,
  wrapSearchIndex,
  type SearchOverlayState,
} from "./sessionSearchOverlay.ts";

function state(overrides: Partial<SearchOverlayState> = {}): SearchOverlayState {
  return { ...EMPTY_SEARCH_OVERLAY, open: true, ...overrides };
}

describe("wrapSearchIndex", () => {
  it("returns -1 for an empty list and wraps in both directions", () => {
    expect(wrapSearchIndex(0, 0)).toBe(-1);
    expect(wrapSearchIndex(3, 0)).toBe(0);
    expect(wrapSearchIndex(3, 2)).toBe(2);
    expect(wrapSearchIndex(3, 3)).toBe(0);
    expect(wrapSearchIndex(3, -1)).toBe(2);
    expect(wrapSearchIndex(3, -4)).toBe(2);
  });
});

describe("searchOverlayReducer", () => {
  it("opens and closes, forgetting the highlight on close", () => {
    let next = searchOverlayReducer(EMPTY_SEARCH_OVERLAY, { type: "open" });
    expect(next.open).toBe(true);
    next = searchOverlayReducer({ ...next, activeIndex: 2 }, { type: "close" });
    expect(next.open).toBe(false);
    expect(next.activeIndex).toBe(-1);
  });

  it("keeps the highlight valid while results shrink and resets it on empty", () => {
    const start = state({ count: 5, activeIndex: 4 });
    expect(searchOverlayReducer(start, { type: "results", count: 3, loading: false }).activeIndex).toBe(1);
    expect(searchOverlayReducer(start, { type: "results", count: 0, loading: false }).activeIndex).toBe(-1);
  });

  it("loads the spinner and the result count together", () => {
    const next = searchOverlayReducer(state(), { type: "results", count: 2, loading: true });
    expect(next.loading).toBe(true);
    expect(next.count).toBe(2);
  });

  it("moves with wrap-around from an unset highlight", () => {
    let next = searchOverlayReducer(state({ count: 3, activeIndex: -1 }), { type: "move", delta: 1 });
    expect(next.activeIndex).toBe(0);
    next = searchOverlayReducer(state({ count: 3, activeIndex: -1 }), { type: "move", delta: -1 });
    expect(next.activeIndex).toBe(2);
  });

  it("wraps from the last row back to the first and vice versa", () => {
    const last = state({ count: 3, activeIndex: 2 });
    expect(searchOverlayReducer(last, { type: "move", delta: 1 }).activeIndex).toBe(0);
    const first = state({ count: 3, activeIndex: 0 });
    expect(searchOverlayReducer(first, { type: "move", delta: -1 }).activeIndex).toBe(2);
  });

  it("ignores moves while closed or without results", () => {
    expect(searchOverlayReducer(state({ open: false, count: 3 }), { type: "move", delta: 1 })).toEqual(
      state({ open: false, count: 3 }),
    );
    expect(searchOverlayReducer(state({ count: 0 }), { type: "move", delta: 1 })).toEqual(
      state({ count: 0 }),
    );
  });

  it("resets the navigation but keeps the overlay open", () => {
    const next = searchOverlayReducer(state({ count: 3, activeIndex: 2 }), { type: "reset" });
    expect(next.open).toBe(true);
    expect(next.activeIndex).toBe(-1);
    expect(next.count).toBe(0);
  });
});

describe("searchKeyAction", () => {
  const results = state({ count: 3, activeIndex: 1 });

  it("maps arrows, Enter and Escape while results exist", () => {
    expect(searchKeyAction("ArrowDown", results)).toBe("down");
    expect(searchKeyAction("ArrowUp", results)).toBe("up");
    expect(searchKeyAction("Enter", results)).toBe("select");
    expect(searchKeyAction("Escape", results)).toBe("close");
  });

  it("swallows no keystroke of a normal query", () => {
    expect(searchKeyAction("a", results)).toBe("none");
    expect(searchKeyAction("ArrowDown", state({ open: false, count: 3 })).toString()).toBe("none");
    expect(searchKeyAction("ArrowDown", state({ count: 0 }))).toBe("none");
    expect(searchKeyAction("Enter", state({ count: 0 }))).toBe("none");
  });

  it("never acts while a modifier is held (Cmd+R reload, Ctrl+A …)", () => {
    expect(searchKeyAction("Enter", results, { metaKey: true })).toBe("none");
    expect(searchKeyAction("ArrowDown", results, { ctrlKey: true })).toBe("none");
    expect(searchKeyAction("a", results, { altKey: true })).toBe("none");
    expect(searchKeyAction("Escape", results, { ctrlKey: true })).toBe("none");
  });

  it("only closes on Escape when the overlay is open", () => {
    expect(searchKeyAction("Escape", state({ open: false, count: 3 }))).toBe("none");
  });
});
