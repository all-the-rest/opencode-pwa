import { fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionTabBar from "./SessionTabBar.tsx";
import Toasts from "./Toasts.tsx";
import { SessionTabsProvider } from "../state/sessionTabs.tsx";
import { ServerProvider } from "../state/servers.tsx";
import { ToastProvider } from "../state/toast.tsx";
import { renameSession } from "../lib/opencode.ts";

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return { ...actual, renameSession: vi.fn() };
});

const renameMock = vi.mocked(renameSession);

function renderBar() {
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/"]}>
        <ServerProvider>
          <ToastProvider>
            <SessionTabsProvider>
              <SessionTabBar />
              <Toasts />
            </SessionTabsProvider>
          </ToastProvider>
        </ServerProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function seedTabs(tabs: Array<{ serverID: string; sessionID: string; title: string }>) {
  localStorage.setItem("opencode-pwa:session-tabs", JSON.stringify(tabs));
}

describe("SessionTabBar (wave 5 gestures)", () => {
  beforeEach(() => {
    localStorage.clear();
    renameMock.mockReset();
    renameMock.mockResolvedValue({ data: undefined, error: null });
    // jsdom has no layout engine: the active-tab scroll-into-view is a no-op.
    Element.prototype.scrollIntoView = () => {};
    seedTabs([
      { serverID: "srv-a", sessionID: "ses-1", title: "Alpha" },
      { serverID: "srv-a", sessionID: "ses-2", title: "Beta" },
    ]);
    localStorage.setItem(
      "opencode-pwa:servers",
      JSON.stringify([
        { id: "srv-a", name: "Server", baseUrl: "http://x.local", username: "", color: "#ff0000" },
      ]),
    );
  });

  it("closes a tab on middle click (aux click, button 1)", () => {
    renderBar();
    const tab = screen.getByTestId("session-tab-ses-1");
    fireEvent.mouseDown(tab, { button: 1 });
    // jsdom/testing-library has no `auxClick` helper: the real event is what
    // the browsers fire for a middle click.
    fireEvent(
      tab,
      new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
    );
    expect(screen.queryByTestId("session-tab-ses-1")).toBeNull();
    expect(screen.getByTestId("session-tab-ses-2")).toBeInTheDocument();
  });

  it("ignores a middle click of a non-primary button", () => {
    renderBar();
    const tab = screen.getByTestId("session-tab-ses-1");
    fireEvent(
      tab,
      new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 2 }),
    );
    expect(screen.getByTestId("session-tab-ses-1")).toBeInTheDocument();
  });

  it("keeps the close-all and the close button working", () => {
    renderBar();
    // Two tabs: the close-all button is offered.
    fireEvent.click(screen.getByTestId("session-tabs-close-all"));
    expect(screen.queryByTestId("session-tab-ses-1")).toBeNull();
    expect(screen.queryByTestId("session-tab-ses-2")).toBeNull();
  });

  it("keeps the per-tab close button working", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Tab Alpha schließen" }));
    expect(screen.queryByTestId("session-tab-ses-1")).toBeNull();
    expect(screen.getByTestId("session-tab-ses-2")).toBeInTheDocument();
  });

  it("opens an inline rename on double click and saves through renameSession", async () => {
    renderBar();
    fireEvent.doubleClick(screen.getByTitle("Alpha (Server)"));
    const input = screen.getByTestId("session-tab-rename-ses-1") as HTMLInputElement;
    expect(input).toHaveValue("Alpha");

    fireEvent.change(input, { target: { value: "Alpha umbenannt" } });
    fireEvent.click(screen.getByTestId("session-tab-rename-save-ses-1"));

    // Optimistic: the label switches immediately …
    expect(screen.getByTitle("Alpha umbenannt (Server)")).toBeInTheDocument();
    // … and the server PATCH carries the new title.
    expect(renameMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "srv-a" }),
      "ses-1",
      "Alpha umbenannt",
    );
  });

  it("cancels the inline rename on Escape without calling renameSession", () => {
    renderBar();
    fireEvent.doubleClick(screen.getByTitle("Alpha (Server)"));
    const input = screen.getByTestId("session-tab-rename-ses-1");
    fireEvent.change(input, { target: { value: "egal" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("session-tab-rename-ses-1")).toBeNull();
    expect(screen.getByTitle("Alpha (Server)")).toBeInTheDocument();
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("rolls the optimistic title back when the rename fails", async () => {
    renameMock.mockResolvedValue({ data: null, error: "Server offline" });
    renderBar();
    fireEvent.doubleClick(screen.getByTitle("Alpha (Server)"));
    const input = screen.getByTestId("session-tab-rename-ses-1");
    fireEvent.change(input, { target: { value: "Neu" } });
    fireEvent.click(screen.getByTestId("session-tab-rename-save-ses-1"));
    // The error toast shows the server message …
    expect(await screen.findByText("Umbenennen fehlgeschlagen: Server offline")).toBeInTheDocument();
    // … and the previous title comes back.
    expect(screen.getByTitle("Alpha (Server)")).toBeInTheDocument();
  });

  it("switches tabs with Cmd/Ctrl+1…9", () => {
    renderBar();
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    // The tab bar navigates; in the MemoryRouter the route changed, so the
    // second tab is now the active one.
    expect(screen.getByTestId("session-tab-ses-2")).toHaveAttribute("aria-selected", "true");
  });

  it("ignores a digit without a modifier", () => {
    renderBar();
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("session-tab-ses-2")).toHaveAttribute("aria-selected", "false");
  });
});
