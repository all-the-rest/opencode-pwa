import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePermission,
  getPermissionStatus,
  isNotificationSupported,
  notifySessionEvent,
} from "./notify.ts";

interface FakeNotificationOptions {
  body?: string;
}

const shown: Array<{ title: string; options?: FakeNotificationOptions }> = [];

const requestPermissionMock = vi.fn(
  async (): Promise<NotificationPermission> => "granted",
);

function installNotification(permission: NotificationPermission): void {
  requestPermissionMock.mockResolvedValue(permission);
  const fake = Object.assign(
    vi.fn((title: string, options?: FakeNotificationOptions): void => {
      shown.push({ title, options });
    }),
    { permission, requestPermission: requestPermissionMock },
  );
  (window as unknown as { Notification: unknown }).Notification = fake;
}

function uninstallNotification(): void {
  delete (window as unknown as { Notification?: unknown }).Notification;
  shown.length = 0;
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
}

afterEach(() => {
  uninstallNotification();
  setHidden(false);
  vi.clearAllMocks();
});

describe("notify without browser support", () => {
  it("reports unsupported and never notifies", async () => {
    expect(isNotificationSupported()).toBe(false);
    expect(getPermissionStatus()).toBe("unsupported");
    expect(await ensurePermission()).toBe("unsupported");
    expect(notifySessionEvent("Titel", "Text", true)).toBe(false);
  });
});

describe("notify with Notification API", () => {
  it("asks for permission once and returns the result", async () => {
    installNotification("default");
    requestPermissionMock.mockResolvedValue("granted");
    expect(await ensurePermission()).toBe("granted");
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
  });

  it("notifies only when the document is hidden unless important", () => {
    installNotification("granted");

    setHidden(true);
    expect(notifySessionEvent("Titel", "Text")).toBe(true);

    setHidden(false);
    expect(notifySessionEvent("Titel", "Text")).toBe(false);
    expect(notifySessionEvent("Wichtig", "Text", true)).toBe(true);

    expect(shown.map((n) => n.title)).toEqual(["Titel", "Wichtig"]);
  });

  it("stays silent without granted permission", () => {
    installNotification("denied");
    setHidden(true);
    expect(notifySessionEvent("Titel", "Text", true)).toBe(false);
    expect(shown).toEqual([]);
  });
});
