import { act, render, screen, within, type RenderResult } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard.tsx";
import { ServerProvider } from "../state/servers.tsx";
import { SessionTabsProvider } from "../state/sessionTabs.tsx";
import { ToastProvider } from "../state/toast.tsx";

// No live polling / event stream in unit tests — the entry render is the focus.
vi.mock("../hooks/useLiveRefresh.ts", () => ({
  useLiveRefresh: () => {},
  LIVE_REFRESH_INTERVAL_MS: 5000,
}));

async function renderDashboard() {
  // No servers seeded: the whole empty-dashboard state is under test.
  localStorage.clear();
  let handle: RenderResult | null = null;
  await act(async () => {
    handle = render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/"]}>
          <ServerProvider>
            <ToastProvider>
              <SessionTabsProvider>
                <Dashboard />
              </SessionTabsProvider>
            </ToastProvider>
          </ServerProvider>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  if (handle === null) throw new Error("render() returned no handle");
  return handle;
}

describe("Dashboard empty state (UI-review finding #4)", () => {
  it("shows exactly ONE welcome empty state — no duplicated no-server card", async () => {
    await renderDashboard();

    // The welcome card is the single deliberate empty state.
    const welcome = screen.getByTestId("dashboard-empty-state");
    expect(within(welcome).getByText(/Noch kein Server eingerichtet/)).toBeInTheDocument();

    // The starter no longer repeats the no-server welcome ("… um Sessions zu
    // starten."); the welcome card's variant ("… zu verwalten.") is the only one.
    expect(screen.queryByText(/um Sessions zu starten/)).toBeNull();

    // Exactly one "Server anlegen" CTA across the dashboard (not two).
    expect(screen.getAllByRole("link", { name: "Server anlegen" })).toHaveLength(1);
  });
});
