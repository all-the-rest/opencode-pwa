import { useEffect, useState } from "react";

/**
 * The "leere Projekte" flag, shared by every view that lists projects.
 *
 * One persisted boolean so the server page's projects card and the sidebar can
 * never disagree about which projects are shown: the server page owns the
 * toggle (`ProjectEmptyFilter`), both read the same storage key. Default is
 * "hide" — only an explicit `"0"` (the user turned the filter off) brings the
 * zero-session projects back.
 */
export const EMPTY_PROJECTS_STORAGE_KEY = "opencode-pwa:projects-hide-empty";

/** Read the persisted flag; a missing/unreadable value means "hide". */
export function loadShowEmptyProjects(): boolean {
  try {
    return localStorage.getItem(EMPTY_PROJECTS_STORAGE_KEY) === "0";
  } catch {
    return false;
  }
}

/**
 * The flag plus its setter, persisted on every change (localStorage, same
 * convention as the layout mode and the session tabs). Storage that cannot be
 * written (full or blocked) only costs the persistence — the toggle keeps
 * working for the current session.
 */
export function useShowEmptyProjects(): [boolean, (showEmpty: boolean) => void] {
  const [showEmptyProjects, setShowEmptyProjects] = useState(loadShowEmptyProjects);

  useEffect(() => {
    try {
      localStorage.setItem(EMPTY_PROJECTS_STORAGE_KEY, showEmptyProjects ? "0" : "1");
    } catch {
      // Storage full or unavailable: the toggle stays session-local.
    }
  }, [showEmptyProjects]);

  return [showEmptyProjects, setShowEmptyProjects];
}
