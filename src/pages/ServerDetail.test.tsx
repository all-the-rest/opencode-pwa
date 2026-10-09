import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerDetail from "./ServerDetail.tsx";
import { ServerProvider } from "../state/servers.tsx";
import { SessionTabsProvider } from "../state/sessionTabs.tsx";
import { LayoutModeProvider } from "../state/layoutMode.tsx";
import { ToastProvider } from "../state/toast.tsx";
import { listShells, listPtys, listProjects, listSessionsPaged } from "../lib/opencode.ts";

// No live polling / event stream in unit tests — the entry render is the focus.
vi.mock("../hooks/useLiveRefresh.ts", () => ({
  useLiveRefresh: () => {},
  LIVE_REFRESH_INTERVAL_MS: 5000,
}));
vi.mock("../hooks/useProjectSync.ts", () => ({ useProjectSync: () => {} }));
// Rename is not exercised here; stub the optimistic hook (it needs the toast).
vi.mock("../hooks/useProjectRename.ts", () => ({ useProjectRename: () => async () => true }));

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return {
    ...actual,
    listSessionsPaged: vi.fn(),
    listShells: vi.fn(),
    listPtys: vi.fn(),
    listProjects: vi.fn(),
  };
});

const listSessionsPagedMock = vi.mocked(listSessionsPaged);
const listShellsMock = vi.mocked(listShells);
const listPtysMock = vi.mocked(listPtys);
const listProjectsMock = vi.mocked(listProjects);

const server = { id: "srv-1", name: "Lokal", baseUrl: "http://x.local", username: "" };

/** `shell.list` / `pty.list` resolve to an opaque client type — cast the fixture. */
const NO_SHELLS = { data: { location: {}, data: [] }, error: null } as unknown as Awaited<
  ReturnType<typeof listShells>
>;
const NO_PTYS = { data: { location: {}, data: [] }, error: null } as unknown as Awaited<
  ReturnType<typeof listPtys>
>;
const ONE_PTY = {
  data: { location: {}, data: [{ id: "pty-1", title: "Terminal 1" }] },
  error: null,
} as unknown as Awaited<ReturnType<typeof listPtys>>;

const NO_SESSIONS = {
  data: { rows: [], cursor: { next: null, previous: null } },
  error: null,
};
const ONE_SESSION = {
  data: {
    rows: [{ id: "s1", label: "Alpha bauen", projectKey: null, agent: null, created: null }],
    cursor: { next: null, previous: null },
  },
  error: null,
};

function renderServer() {
  localStorage.setItem("opencode-pwa:servers", JSON.stringify([server]));
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/servers/srv-1"]}>
        <ServerProvider>
          <LayoutModeProvider>
            <SessionTabsProvider>
              <ToastProvider>
                <Routes>
                  <Route path="/servers/:id" element={<ServerDetail />} />
                </Routes>
              </ToastProvider>
            </SessionTabsProvider>
          </LayoutModeProvider>
        </ServerProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("ServerDetail empty-state rendering (UI-review finding #3)", () => {
  beforeEach(() => {
    localStorage.clear();
    listSessionsPagedMock.mockReset();
    listShellsMock.mockReset();
    listPtysMock.mockReset();
    listProjectsMock.mockReset();
  });

  it("shows ONE deliberate empty state instead of four hollow cards when everything is empty", async () => {
    listSessionsPagedMock.mockResolvedValue(NO_SESSIONS);
    listShellsMock.mockResolvedValue(NO_SHELLS);
    listPtysMock.mockResolvedValue(NO_PTYS);
    listProjectsMock.mockResolvedValue({ data: [], error: null });
    renderServer();

    await waitFor(() => expect(screen.getByTestId("server-empty")).toBeInTheDocument());
    // The four-card grid is not rendered at all.
    expect(screen.queryByTestId("server-panels")).toBeNull();
    expect(screen.queryByTestId("projects-card")).toBeNull();
    expect(screen.queryByTestId("sessions-card")).toBeNull();
    // The empty state still offers the folder picker and the session-starter CTA.
    expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    expect(screen.getByTestId("server-sessions-empty-cta")).toHaveAttribute("href", "/");
  });

  it("keeps action cards (projects/sessions/shells) and renders the PTY card only when it has content", async () => {
    listSessionsPagedMock.mockResolvedValue(ONE_SESSION);
    listShellsMock.mockResolvedValue(NO_SHELLS);
    listPtysMock.mockResolvedValue(ONE_PTY);
    listProjectsMock.mockResolvedValue({ data: [], error: null });
    renderServer();

    await waitFor(() => expect(screen.getByTestId("server-panels")).toBeInTheDocument());
    expect(screen.queryByTestId("server-empty")).toBeNull();
    expect(screen.getByTestId("projects-card")).toBeInTheDocument();
    expect(screen.getByTestId("sessions-card")).toBeInTheDocument();
    expect(screen.getByTestId("shells-card")).toBeInTheDocument();
    // Projects and shells are empty here but still render: each carries an action.
    expect(screen.getByTestId("ptys-card")).toBeInTheDocument();
  });

  it("hides the PTY card without content while keeping the session list's own empty state + CTA (mirrors the e2e empty-session scenario)", async () => {
    listSessionsPagedMock.mockResolvedValue(NO_SESSIONS);
    listShellsMock.mockResolvedValue(NO_SHELLS);
    listPtysMock.mockResolvedValue(NO_PTYS);
    listProjectsMock.mockResolvedValue({
      data: [{ id: "p1", name: "Repo", canonical: "/repo" }],
      error: null,
    });
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    // Not the consolidated empty state (there is a project).
    expect(screen.queryByTestId("server-empty")).toBeNull();
    expect(screen.getByTestId("server-panels")).toBeInTheDocument();
    // PTY card is content-gated: no PTYs, no empty-action → hidden.
    expect(screen.queryByTestId("ptys-card")).toBeNull();
    // The session list keeps its own empty state and CTA (e2e relies on both).
    expect(screen.getByTestId("server-sessions-empty")).toHaveTextContent("Keine Sessions.");
    expect(screen.getByTestId("server-sessions-empty-cta")).toHaveAttribute("href", "/");
  });
});
