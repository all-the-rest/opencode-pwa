export type NotificationPermissionState = NotificationPermission | "unsupported";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getPermissionStatus(): NotificationPermissionState {
  if (!isNotificationSupported()) return "unsupported";
  return window.Notification.permission;
}

export async function ensurePermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return "unsupported";
  if (window.Notification.permission === "granted") return "granted";
  if (window.Notification.permission === "denied") return "denied";
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

export interface SessionNotification {
  title: string;
  body: string;
  important: boolean;
}

/**
 * Fire a local notification for a session event.
 * No push server involved: uses the `Notification` API only, and only when
 * permission was granted. Non-important events are skipped while the document
 * is visible; important ones (permission requests, failures) always notify.
 * Returns true when a notification was shown.
 */
export function notifySessionEvent(title: string, body: string, important = false): boolean {
  if (!isNotificationSupported()) return false;
  if (window.Notification.permission !== "granted") return false;
  if (!important && typeof document !== "undefined" && !document.hidden) return false;
  try {
    new window.Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}
