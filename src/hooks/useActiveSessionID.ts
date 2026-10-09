import { useLocation } from "react-router-dom";

/**
 * Session id the tab bar currently shows, or null on every non-session route.
 * Used by the session lists to clear a row's unread dot when the user opens it.
 */
export function useActiveSessionID(): string | null {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/sessions\/([^/]+)$/);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}
