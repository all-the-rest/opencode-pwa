import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionTabsProvider,
  SESSION_TABS_STORAGE_KEY,
  useSessionTabs,
} from "./sessionTabs.tsx";

function Probe() {
  const { tabs } = useSessionTabs();
  return (
    <div>
      <span data-testid="count">{tabs.length}</span>
      <span data-testid="titles">{tabs.map((t) => t.title).join("|")}</span>
    </div>
  );
}

function Opener() {
  const { tabs, openTab, closeTab, retitleTab } = useSessionTabs();
  return (
    <div>
      <span data-testid="count">{tabs.length}</span>
      <span data-testid="titles">{tabs.map((t) => `${t.serverID}:${t.sessionID}:${t.title}`).join("|")}</span>
      <button type="button" onClick={() => openTab({ serverID: "srv-a", sessionID: "ses-1", title: "Alpha" })}>
        open-a1
      </button>
      <button type="button" onClick={() => openTab({ serverID: "srv-b", sessionID: "ses-1", title: "Beta" })}>
        open-b1
      </button>
      <button type="button" onClick={() => retitleTab("srv-a", "ses-1", "Alpha neu")}>
        retitle
      </button>
      <button type="button" onClick={() => closeTab("srv-a", "ses-1")}>
        close-a1
      </button>
    </div>
  );
}

describe("SessionTabsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty and persists opened tabs across remount", async () => {
    const first = render(
      <SessionTabsProvider>
        <Opener />
      </SessionTabsProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    act(() => {
      screen.getByRole("button", { name: "open-a1" }).click();
      screen.getByRole("button", { name: "open-b1" }).click();
    });
    // Same session id on different servers stays two tabs (server-bound).
    expect(screen.getByTestId("count")).toHaveTextContent("2");

    const raw = localStorage.getItem(SESSION_TABS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(2);

    first.unmount();
    render(
      <SessionTabsProvider>
        <Probe />
      </SessionTabsProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(screen.getByTestId("titles")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("titles")).toHaveTextContent("Beta");
  });

  it("reopening a tab refreshes the title instead of duplicating", () => {
    render(
      <SessionTabsProvider>
        <Opener />
      </SessionTabsProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "open-a1" }).click();
      screen.getByRole("button", { name: "open-a1" }).click();
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    act(() => {
      screen.getByRole("button", { name: "retitle" }).click();
    });
    expect(screen.getByTestId("titles")).toHaveTextContent("Alpha neu");
  });

  it("closing a tab keeps the others", () => {
    render(
      <SessionTabsProvider>
        <Opener />
      </SessionTabsProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "open-a1" }).click();
      screen.getByRole("button", { name: "open-b1" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "close-a1" }).click();
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("titles")).toHaveTextContent("srv-b:ses-1:Beta");
  });

  it("ignores invalid stored entries and falls back to the session id", () => {
    localStorage.setItem(
      SESSION_TABS_STORAGE_KEY,
      JSON.stringify([
        { serverID: "srv-a", sessionID: "ses-1" },
        { serverID: "", sessionID: "ses-x" },
        "kaputt",
        null,
      ]),
    );
    render(
      <SessionTabsProvider>
        <Probe />
      </SessionTabsProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("titles")).toHaveTextContent("ses-1");
  });

  it("falls back to empty tabs on corrupt JSON", () => {
    localStorage.setItem(SESSION_TABS_STORAGE_KEY, "{kein-json");
    render(
      <SessionTabsProvider>
        <Probe />
      </SessionTabsProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});
