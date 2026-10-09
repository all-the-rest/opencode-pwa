import { describe, expect, it } from "vitest";
import { MAX_TAB_SHORTCUT, resolveTabIndex, tabShortcutIndex } from "./tabShortcuts.ts";

describe("tabShortcutIndex", () => {
  it("maps Cmd/Ctrl+1…9 onto a 0-based index", () => {
    for (let number = 1; number <= MAX_TAB_SHORTCUT; number += 1) {
      expect(tabShortcutIndex(String(number), false, true)).toBe(number - 1);
      expect(tabShortcutIndex(String(number), true, false)).toBe(number - 1);
    }
  });

  it("needs a modifier: a bare digit is a normal keystroke", () => {
    expect(tabShortcutIndex("1", false, false)).toBeNull();
    expect(tabShortcutIndex("a", true, false)).toBeNull();
  });

  it("ignores 0 and every two-digit key", () => {
    expect(tabShortcutIndex("0", true, false)).toBeNull();
    expect(tabShortcutIndex("12", true, false)).toBeNull();
    expect(tabShortcutIndex("ArrowDown", true, false)).toBeNull();
    expect(tabShortcutIndex("Enter", true, false)).toBeNull();
  });

  it("works with both modifiers held", () => {
    expect(tabShortcutIndex("3", true, true)).toBe(2);
  });
});

describe("resolveTabIndex", () => {
  it("clamps into the open tab list", () => {
    expect(resolveTabIndex(0, 3)).toBe(0);
    expect(resolveTabIndex(2, 3)).toBe(2);
    expect(resolveTabIndex(3, 3)).toBeNull();
    expect(resolveTabIndex(-1, 3)).toBeNull();
    expect(resolveTabIndex(null, 3)).toBeNull();
    expect(resolveTabIndex(0, 0)).toBeNull();
  });
});
