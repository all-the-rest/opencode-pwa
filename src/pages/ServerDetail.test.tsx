import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import type { ApiResult, SessionPage, SessionListOptions } from "../lib/opencode.ts";
import {
  resetProjectSessionProbesForTests,
  SESSION_PROBE_LIMIT,
} from "../hooks/useProjectsWithSessions.ts";

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
    // The probe is module state shared by both views; drop the last answer.
    resetProjectSessionProbesForTests();
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

/**
 * The "leere Projekte" filter (owner ask): 10 of their 23 projects have zero
 * sessions and must be out of the tree by default, with a toggle to bring them
 * back. The signal is the SHARED probe (`useProjectsWithSessions`): one wide
 * `session.list` request per server, the same one the sidebar reads. The page's
 * own card rows stay exactly what they were — the fixtures below shape both.
 */
describe("ServerDetail leere Projekte filter (owner ask)", () => {
  /** Two projects with a session, two without (one of them a parent folder). */
  const MIX = [
    { id: "p-empty-leaf", name: "/de", canonical: "/de" },
    { id: "p-parent", name: "/srv/app", canonical: "/srv/app" },
    { id: "p-child", name: "/srv/app/services/api", canonical: "/srv/app/services/api" },
    { id: "p-active", name: "/tmp/opencode/proj-smoke", canonical: "/tmp/opencode/proj-smoke" },
  ];

  /**
   * What the page's own page-1 session rows carry: `p-child` and `p-active`
   * from {@link MIX}, plus `p-active-flat` for the flat-list test below.
   * Everything else in the mix has zero sessions.
   */
  const SESSIONS_OF_MIX = {
    data: {
      rows: [
        { id: "ses-child", label: "API bauen", projectKey: "p-child", agent: "build", created: null },
        { id: "ses-active", label: "Rauchtest", projectKey: "p-active", agent: "build", created: null },
        { id: "ses-flat", label: "Flach bauen", projectKey: "p-active-flat", agent: "build", created: null },
      ],
      cursor: { next: null, previous: null },
    },
    error: null,
  };

  function mockMix() {
    listSessionsPagedMock.mockResolvedValue(SESSIONS_OF_MIX);
    listShellsMock.mockResolvedValue(NO_SHELLS);
    listPtysMock.mockResolvedValue(NO_PTYS);
    listProjectsMock.mockResolvedValue({ data: MIX, error: null });
  }

  beforeEach(() => {
    // The toggle persists in localStorage — every test starts from the default.
    localStorage.clear();
    // The probe is module state shared by both views; drop the last answer.
    resetProjectSessionProbesForTests();
    mockMix();
  });

  it("hides the zero-session projects by default and counts only what it shows", async () => {
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    // Zero sessions → out of the tree.
    expect(screen.queryByTestId("project-row-p-empty-leaf")).toBeNull();
    expect(screen.queryByTestId("project-row-p-parent")).toBeNull();
    // A session → stays, and the toggle names how many are hidden.
    expect(screen.getByTestId("project-row-p-child")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-active")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Projekte/ })).toHaveTextContent("Projekte (2)");
    expect(screen.getByText("Leere Projekte anzeigen (2)")).toBeInTheDocument();
  });

  it("keeps an empty parent folder as a structural node while its child has sessions", async () => {
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    // The folder row lost its own project (no link, no rename) …
    expect(screen.getByTestId("project-node-/srv/app")).toBeInTheDocument();
    expect(screen.queryByTestId("project-rename-p-parent")).toBeNull();
    // … but it stays, and the project below it stays nested under it.
    expect(screen.getByTestId("project-row-p-child")).toBeInTheDocument();
    // The empty leaf root is gone entirely.
    expect(screen.queryByTestId("project-node-/de")).toBeNull();
  });

  it("shows every project again once the toggle is turned on", async () => {
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("projects-empty-filter"));
    expect(screen.getByTestId("project-row-p-empty-leaf")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-parent")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Projekte/ })).toHaveTextContent("Projekte (4)");
  });

  it("keeps the toggle across a reload (one boolean in localStorage)", async () => {
    const first = renderServer();
    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("projects-empty-filter"));
    expect(screen.getByTestId("project-row-p-empty-leaf")).toBeInTheDocument();
    expect(localStorage.getItem("opencode-pwa:projects-hide-empty")).toBe("0");

    first.unmount();
    // A fresh mount is what a reload does: the choice is read back.
    renderServer();
    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    expect(screen.getByTestId("project-row-p-empty-leaf")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-child")).toBeInTheDocument();
  });

  it("falls back to hiding when the stored value is unreadable", async () => {
    localStorage.setItem("opencode-pwa:projects-hide-empty", "quatsch");
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    expect(screen.queryByTestId("project-row-p-empty-leaf")).toBeNull();
    expect(screen.getByTestId("projects-empty-filter")).not.toBeChecked();
  });

  it("filters the flat list as well when the tree degenerates", async () => {
    // Siblings under one common root render as the flat list, not as a tree.
    listProjectsMock.mockResolvedValue({
      data: [
        { id: "p-empty-flat", name: "/repo/leer", canonical: "/repo/leer" },
        { id: "p-active-flat", name: "/repo/aktiv", canonical: "/repo/aktiv" },
      ],
      error: null,
    });
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    // One row only: the flat list is filtered like the tree.
    expect(screen.queryByTestId("project-row-p-empty-flat")).toBeNull();
    expect(screen.getByTestId("project-row-p-active-flat")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Projekte/ })).toHaveTextContent("Projekte (1)");
    fireEvent.click(screen.getByTestId("projects-empty-filter"));
    expect(screen.getByTestId("project-row-p-empty-flat")).toBeInTheDocument();
  });

  it("still renders the card (not the consolidated empty state) when every project is empty", async () => {
    listSessionsPagedMock.mockResolvedValue(NO_SESSIONS);
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    // An empty project list is not an empty server: the cards stay.
    expect(screen.queryByTestId("server-empty")).toBeNull();
    expect(screen.getByText("Keine Projekte mit Sessions.")).toBeInTheDocument();
    expect(screen.getByTestId("projects-empty-filter")).toBeInTheDocument();
  });

  it("keeps a project whose only session sits beyond the card's own page 1", async () => {
    // The measured case: the card loads 50 rows, the owner's live server holds
    // 1000+ sessions and a cursor pointing at more, so those 50 rows cover a
    // handful of projects while the same server's first 1000 rows cover 13. A
    // project whose single session is older than page 1 used to look empty —
    // the shared probe reads the wide window instead of the card's rows.
    const MIX_WITH_LATE = [...MIX, { id: "p-late", name: "/srv/late", canonical: "/srv/late" }];
    listProjectsMock.mockResolvedValue({ data: MIX_WITH_LATE, error: null });
    listSessionsPagedMock.mockImplementation((_server, options?: SessionListOptions) =>
      Promise.resolve(
        options?.limit === SESSION_PROBE_LIMIT
          ? ({
              data: {
                rows: [
                  ...SESSIONS_OF_MIX.data.rows,
                  {
                    id: "ses-late",
                    label: "Spät",
                    projectKey: "p-late",
                    agent: "build",
                    created: null,
                  },
                ],
                cursor: { next: null, previous: null },
              },
              error: null,
            } satisfies ApiResult<SessionPage>)
          : SESSIONS_OF_MIX,
      ),
    );
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    // The card itself still lists only its own page-1 session.
    expect(screen.queryByTestId("session-row-ses-late")).toBeNull();
    // The project it belongs to keeps its row anyway.
    expect(screen.getByTestId("project-row-p-late")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Projekte/ })).toHaveTextContent("Projekte (3)");
    // The still-empty projects stay hidden, as before.
    expect(screen.queryByTestId("project-row-p-empty-leaf")).toBeNull();
    expect(screen.queryByTestId("project-row-p-parent")).toBeNull();
  });

  it("fails open while the probe is unknown: nothing is hidden", async () => {
    // Probe unreachable (or still in flight): unknown is NOT empty, so the
    // filter stays off and every project keeps its row.
    listSessionsPagedMock.mockImplementation((_server, options?: SessionListOptions) =>
      Promise.resolve(
        options?.limit === SESSION_PROBE_LIMIT
          ? ({ data: null, error: "offline" } satisfies ApiResult<SessionPage>)
          : SESSIONS_OF_MIX,
      ),
    );
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    expect(screen.getByTestId("project-row-p-empty-leaf")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-parent")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Projekte/ })).toHaveTextContent("Projekte (4)");
    // Nothing hidden, so nothing to reveal.
    expect(screen.queryByTestId("projects-empty-filter")).toBeNull();
  });

  it("asks the probe for the wide window, the card for its page 1 only", async () => {
    renderServer();

    await waitFor(() => expect(screen.getByTestId("projects-card")).toBeInTheDocument());
    const limits = listSessionsPagedMock.mock.calls.map(([, options]) => options?.limit);
    expect(limits).toContain(SESSION_PROBE_LIMIT);
    expect(limits).toContain(50);
  });
});
