/**
 * Tab keyboard shortcuts (pure, unit-tested).
 *
 * The original Opencode web UI switches tabs with Cmd/Ctrl+1…9
 * (`titlebar-tab-strip.tsx`, `useTabShortcut`: `keybind: "mod+${number}"`,
 * only 1..9 are registered). This module holds that rule so the tab bar stays a
 * thin DOM layer and the behaviour is testable without a browser.
 */

/** Highest tab number a shortcut may address (1…9, like the original). */
export const MAX_TAB_SHORTCUT = 9;

/**
 * 0-based tab index a keydown addresses, or null when it is not a tab
 * shortcut. Requires Cmd (macOS) or Ctrl (Windows/Linux); a digit without a
 * modifier is a normal keystroke (e.g. typing in the session search).
 */
export function tabShortcutIndex(key: string, metaKey: boolean, ctrlKey: boolean): number | null {
  if (!metaKey && !ctrlKey) return null;
  if (key.length !== 1 || key < "1" || key > "9") return null;
  return Number(key) - 1;
}

/** Clamp a shortcut index into the open tab list (null when out of range). */
export function resolveTabIndex(index: number | null, tabCount: number): number | null {
  if (index === null) return null;
  if (index < 0 || index >= tabCount) return null;
  return index;
}
