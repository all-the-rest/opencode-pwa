import { act, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SidebarProjects from "./SidebarProjects.tsx";
import { ServerProvider } from "../state/servers.tsx";
import { listProjects, listSessionsPaged } from "../lib/opencode.ts";
import type { ProjectInfo, SessionRow } from "../lib/opencode.ts";

// No live polling / event stream in unit tests — the entry render is the focus.
vi.mock("../hooks/useLiveRefresh.ts", () => ({
  useLiveRefresh: () => {},
  LIVE_REFRESH_INTERVAL_MS: 5000,
}));

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  // The sidebar only needs the API wrappers stubbed; types stay real.
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return {
    ...actual,
    listProjects: vi.fn(),
    listSessionsPaged: vi.fn(),
  };
});

const listProjectsMock = vi.mocked(listProjects);
const listSessionsPagedMock = vi.mocked(listSessionsPaged);

const server = { id: "srv-1", name: "Lokal", baseUrl: "http://x.local", username: "" };

function project(id: string, canonical: string): ProjectInfo {
  return { id, name: canonical, canonical };
}

const MIX = [project("p-active", "/repo/aktiv"), project("p-empty", "/repo/leer")];

function session(id: string, projectKey: string | null): SessionRow {
  return { id, label: `Session ${id}`, projectKey, agent: null, created: null };
}

function sessions(rows: SessionRow[]) {
  return { data: { rows, cursor: { next: null, previous: null } }, error: null };
}

function projects(rows: ProjectInfo[]) {
  return { data: rows, error: null };
}

function renderSidebar() {
  localStorage.setItem("opencode-pwa:servers", JSON.stringify([server]));
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ServerProvider>
          <SidebarProjects />
        </ServerProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("SidebarProjects — the shared empty-projects filter", () => {
  beforeEach(() => {
    // The flag persists in localStorage — every test starts from the default.
    localStorage.clear();
    listProjectsMock.mockReset();
    listSessionsPagedMock.mockReset();
  });

  it("hides the zero-session projects once the loaded session rows resolved", async () => {
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue(sessions([session("s1", "p-active")]));
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    // Same rule as the server page's projects card: no session → no row.
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
    // The session that carries the project still shows up in the list below.
    expect(screen.getByTestId("sidebar-session-s1")).toBeInTheDocument();
  });

  it("reads the SAME persisted flag as the server page and shows every project when it is off", async () => {
    localStorage.setItem("opencode-pwa:projects-hide-empty", "0");
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue(sessions([session("s1", "p-active")]));
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    expect(screen.getByTestId("sidebar-project-p-empty")).toBeInTheDocument();
  });

  it("renders no toggle of its own (the server page owns the control)", async () => {
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue(sessions([session("s1", "p-active")]));
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    expect(screen.queryByTestId("projects-empty-filter")).toBeNull();
  });

  it("does not filter while the session rows are unknown (first render / empty payload)", async () => {
    // The sidebar loads both lists in one `Promise.all`, so the only way to
    // hold projects WITHOUT session rows is a sessions payload that carries no
    // rows. Then "zero sessions" is what is KNOWN, not what is TRUE — every
    // project stays visible instead of flashing away.
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue({ data: null, error: null });
    renderSidebar();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-project-p-empty")).toBeInTheDocument();
  });

  it("hides every project row when the server has no sessions at all", async () => {
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue(sessions([]));
    renderSidebar();

    // Both lists settle together; flush the microtasks that apply them.
    await act(async () => {
      await Promise.resolve();
    });
    expect(listProjectsMock).toHaveBeenCalled();
    // Nothing to show — and no "Keine Projekte." note: the server HAS projects,
    // they are only hidden. The wording lives on the server page's card.
    expect(screen.queryByTestId("sidebar-project-p-active")).toBeNull();
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
    expect(screen.queryByText("Keine Projekte.")).toBeNull();
  });

  it("renders the offline note when the fetch failed (no rows are filtered on)", async () => {
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue({ data: null, error: "offline" });
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-projects-offline")).toBeInTheDocument());
    // Nothing was loaded, so nothing is filtered: the sidebar falls back to the
    // offline note rather than to an empty project list.
    expect(screen.queryByTestId("sidebar-project-p-active")).toBeNull();
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
  });

  it("follows a session without a project key (it belongs to no project)", async () => {
    listProjectsMock.mockResolvedValue(projects(MIX));
    listSessionsPagedMock.mockResolvedValue(sessions([session("s1", null)]));
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-session-s1")).toBeInTheDocument());
    // A keyless session keeps no project alive — same as on the server page.
    expect(screen.queryByTestId("sidebar-project-p-active")).toBeNull();
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
  });
});
