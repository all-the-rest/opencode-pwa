import { act, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SidebarProjects from "./SidebarProjects.tsx";
import { ServerProvider } from "../state/servers.tsx";
import { listProjects, listSessionsPaged } from "../lib/opencode.ts";
import type {
  ApiResult,
  ProjectInfo,
  SessionListOptions,
  SessionPage,
  ServerConfig,
  SessionRow,
} from "../lib/opencode.ts";
import {
  resetProjectSessionProbesForTests,
  SESSION_PROBE_LIMIT,
} from "../hooks/useProjectsWithSessions.ts";

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

const server: ServerConfig = {
  id: "srv-1",
  name: "Lokal",
  baseUrl: "http://x.local",
  username: "",
};

function project(id: string, canonical: string): ProjectInfo {
  return { id, name: canonical, canonical };
}

const MIX = [project("p-active", "/repo/aktiv"), project("p-empty", "/repo/leer")];

function session(id: string, projectKey: string | null): SessionRow {
  return { id, label: `Session ${id}`, projectKey, agent: null, created: null };
}

function page(rows: SessionRow[]): ApiResult<SessionPage> {
  return { data: { rows, cursor: { next: null, previous: null } }, error: null };
}

function projects(rows: ProjectInfo[]): ApiResult<ProjectInfo[]> {
  return { data: rows, error: null };
}

/** Flush the microtask chains both the list and the probe settle in. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * The two session answers a mounted sidebar sees: its OWN rows (15 newest,
 * drives the "Neueste Sessions" list) and the SHARED probe's rows (the wide
 * window that drives the filter). They are deliberately different here — the
 * whole point of the fix is that the filter only ever reads the second one.
 */
let ownRows: ApiResult<SessionPage>;
let probeRows: ApiResult<SessionPage>;

function answer(limit: number | undefined): ApiResult<SessionPage> {
  return limit === SESSION_PROBE_LIMIT ? probeRows : ownRows;
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
    // The probe is module state shared by both views; drop the last answer.
    resetProjectSessionProbesForTests();
    listProjectsMock.mockReset();
    listSessionsPagedMock.mockReset();
    listSessionsPagedMock.mockImplementation((_server, options?: SessionListOptions) =>
      Promise.resolve(answer(options?.limit)),
    );
    ownRows = page([session("s-new", "p-active")]);
    probeRows = page([session("s-new", "p-active")]);
    listProjectsMock.mockResolvedValue(projects(MIX));
  });

  it("hides the zero-session projects once the probe resolved", async () => {
    ownRows = page([session("s-new", "p-active")]);
    probeRows = page([session("s-new", "p-active")]);
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    // Same rule as the server page's projects card: no session → no row.
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
    // The session that carries the project still shows up in the list below.
    expect(screen.getByTestId("sidebar-session-s-new")).toBeInTheDocument();
  });

  it("keeps a project whose only session is older than the sidebar's own 15 newest", async () => {
    // The measured case: the sidebar holds the 15 newest rows, the probe the
    // wide window. `p-late` has exactly one session and it is not among the
    // newest — reading the sidebar's own rows hid it here while the server
    // page (50 rows) still showed it. Now both read the probe.
    const MIX_WITH_LATE = [...MIX, project("p-late", "/repo/spaeter")];
    listProjectsMock.mockResolvedValue(projects(MIX_WITH_LATE));
    ownRows = page([session("s-new", "p-active")]);
    probeRows = page([session("s-new", "p-active"), session("s-late", "p-late")]);
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    expect(screen.getByTestId("sidebar-project-p-late")).toBeInTheDocument();
    // The still-empty project stays hidden, and the older session does NOT
    // leak into the sidebar's own newest list.
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
    expect(screen.queryByTestId("sidebar-session-s-late")).toBeNull();
  });

  it("reads the filter signal from the probe, not from the sidebar's own rows", async () => {
    // A session that only the sidebar's newest list carries keeps no project
    // alive: one rule (the probe) decides, so the two views cannot drift.
    ownRows = page([session("s-new", "p-empty")]);
    probeRows = page([session("s-new", "p-active")]);
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-session-s-new")).toBeInTheDocument());
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
    expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument();
  });

  it("reads the SAME persisted flag as the server page and shows every project when it is off", async () => {
    localStorage.setItem("opencode-pwa:projects-hide-empty", "0");
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    expect(screen.getByTestId("sidebar-project-p-empty")).toBeInTheDocument();
  });

  it("renders no toggle of its own (the server page owns the control)", async () => {
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    expect(screen.queryByTestId("projects-empty-filter")).toBeNull();
  });

  it("does not filter while the probe is in flight (unknown ≠ empty)", async () => {
    // The probe has not answered yet: "zero sessions" is then merely what is
    // KNOWN, not what is true, so every project stays visible.
    listSessionsPagedMock.mockImplementation((_server, options?: SessionListOptions) =>
      options?.limit === SESSION_PROBE_LIMIT
        ? new Promise<ApiResult<SessionPage>>(() => {})
        : Promise.resolve(answer(options?.limit)),
    );
    renderSidebar();

    await settle();
    expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-project-p-empty")).toBeInTheDocument();
    // The sidebar's own list renders regardless of the probe.
    expect(screen.getByTestId("sidebar-session-s-new")).toBeInTheDocument();
  });

  it("does not filter on a probe payload without rows (nothing known yet)", async () => {
    probeRows = { data: null, error: null };
    renderSidebar();

    await settle();
    expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-project-p-empty")).toBeInTheDocument();
  });

  it("hides every project row when the probe resolved with no sessions at all", async () => {
    ownRows = page([session("s-new", null)]);
    probeRows = page([]);
    renderSidebar();

    await settle();
    expect(listProjectsMock).toHaveBeenCalled();
    // Nothing to show — and no "Keine Projekte." note: the server HAS projects,
    // they are only hidden. The wording lives on the server page's card.
    expect(screen.queryByTestId("sidebar-project-p-active")).toBeNull();
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
    expect(screen.queryByText("Keine Projekte.")).toBeNull();
  });

  it("fails open when only the probe fails: the list stays and nothing is filtered on", async () => {
    // The sidebar's own lists answered; only the wide probe is unreachable
    // (e.g. the server rejects `limit=1000`). Unknown ≠ empty.
    listSessionsPagedMock.mockImplementation((_server, options?: SessionListOptions) =>
      Promise.resolve(
        options?.limit === SESSION_PROBE_LIMIT ? { data: null, error: "offline" } : answer(15),
      ),
    );
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    expect(screen.getByTestId("sidebar-project-p-empty")).toBeInTheDocument();
    // The own rows are unaffected by the failed probe.
    expect(screen.getByTestId("sidebar-session-s-new")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-projects-offline")).toBeNull();
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
    ownRows = page([session("s-new", null)]);
    probeRows = page([session("s-new", null)]);
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-session-s-new")).toBeInTheDocument());
    // A keyless session keeps no project alive — same as on the server page.
    expect(screen.queryByTestId("sidebar-project-p-active")).toBeNull();
    expect(screen.queryByTestId("sidebar-project-p-empty")).toBeNull();
  });

  it("asks for the probe window exactly once, whatever the sidebar renders", async () => {
    renderSidebar();

    await waitFor(() => expect(screen.getByTestId("sidebar-project-p-active")).toBeInTheDocument());
    const probeCalls = listSessionsPagedMock.mock.calls.filter(
      ([, options]) => options?.limit === SESSION_PROBE_LIMIT,
    );
    expect(probeCalls).toHaveLength(1);
    // The sidebar's own newest list still uses its own, smaller page.
    expect(
      listSessionsPagedMock.mock.calls.filter(([, options]) => options?.limit === 15),
    ).toHaveLength(1);
  });
});
