import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionStarter from "./SessionStarter.tsx";
import { SessionTabsProvider } from "../state/sessionTabs.tsx";
import { ServerProvider } from "../state/servers.tsx";
import { ToastProvider } from "../state/toast.tsx";
import {
  createSession,
  listDirectory,
  listProjects,
  listSessionsPaged,
  type ServerConfig,
  type SessionInfo,
} from "../lib/opencode.ts";

// The starter's live refresh would open an event stream — a no-op keeps the
// test hermetic (the entry point, not the polling, is what we verify).
vi.mock("../hooks/useLiveRefresh.ts", () => ({
  useLiveRefresh: () => {},
  LIVE_REFRESH_INTERVAL_MS: 5000,
}));

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return {
    ...actual,
    listSessionsPaged: vi.fn(),
    listProjects: vi.fn(),
    listDirectory: vi.fn(),
    createSession: vi.fn(),
  };
});

const listSessionsPagedMock = vi.mocked(listSessionsPaged);
const listProjectsMock = vi.mocked(listProjects);
const listDirectoryMock = vi.mocked(listDirectory);
const createSessionMock = vi.mocked(createSession);

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://x.local",
  username: "",
};

const created: SessionInfo = { id: "ses-starter", agent: null, model: null, tokens: null, cost: null };

/** Where the router currently points (navigate target of the created session). */
function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}

function seedServers(list: ServerConfig[]) {
  localStorage.setItem("opencode-pwa:servers", JSON.stringify(list));
}

function renderStarter() {
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/"]}>
        <ServerProvider>
          <ToastProvider>
            <SessionTabsProvider>
              <SessionStarter />
              <LocationProbe />
            </SessionTabsProvider>
          </ToastProvider>
        </ServerProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("SessionStarter (new-project folder picker)", () => {
  beforeEach(() => {
    localStorage.clear();
    listSessionsPagedMock.mockReset();
    listProjectsMock.mockReset();
    listDirectoryMock.mockReset();
    createSessionMock.mockReset();
    listSessionsPagedMock.mockResolvedValue({
      data: { rows: [], cursor: { next: null, previous: null } },
      error: null,
    });
    listProjectsMock.mockResolvedValue({ data: [], error: null });
    createSessionMock.mockResolvedValue({ data: created, error: null });
    // `file.list`: the server root lists a `srv` directory.
    listDirectoryMock.mockImplementation((_server, path) =>
      Promise.resolve(
        path === undefined || path === ""
          ? { data: { location: "/", entries: [{ path: "srv", type: "directory" }] }, error: null }
          : { data: { location: path, entries: [] }, error: null },
      ) as unknown as ReturnType<typeof listDirectory>,
    );
  });

  it("opens the folder picker from the starter and creates a session in the chosen directory", async () => {
    seedServers([server]);
    renderStarter();

    const open = screen.getByTestId("starter-new-project-button");
    expect(open).toBeEnabled();
    fireEvent.click(open);

    // The shared picker opens on the server location.
    await waitFor(() => expect(screen.getByTestId("folder-picker")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("folder-picker-entry-srv")).toBeInTheDocument());

    // Navigate into the folder and confirm: a session is created there.
    fireEvent.click(screen.getByTestId("folder-picker-entry-srv"));
    await waitFor(() => expect(screen.getByTestId("folder-picker-path")).toHaveTextContent("/srv"));
    fireEvent.click(screen.getByTestId("folder-picker-confirm"));

    await waitFor(() =>
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "s1" }),
        { directory: "/srv" },
      ),
    );

    // The session opens in a tab …
    await waitFor(() => {
      const raw = localStorage.getItem("opencode-pwa:session-tabs") ?? "[]";
      expect(raw).toContain("ses-starter");
    });
    // … and the router navigated to it with the selected server riding along.
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/sessions/ses-starter?server=s1"),
    );
  });

  it("disables the new-project button and hints when no server is configured", () => {
    seedServers([]);
    renderStarter();
    const open = screen.getByTestId("starter-new-project-button");
    expect(open).toBeDisabled();
    expect(screen.getByTestId("starter-new-project-hint")).toBeInTheDocument();
    // The picker never renders without a server, so it cannot be opened.
    expect(screen.queryByTestId("folder-picker")).toBeNull();
  });
});

describe("SessionStarter empty states (UI-review finding #4)", () => {
  beforeEach(() => {
    localStorage.clear();
    listSessionsPagedMock.mockReset();
    listProjectsMock.mockReset();
    listSessionsPagedMock.mockResolvedValue({
      data: { rows: [], cursor: { next: null, previous: null } },
      error: null,
    });
    listProjectsMock.mockResolvedValue({ data: [], error: null });
  });

  it("does not repeat the no-server welcome — exactly one dashboard empty state owns that CTA", () => {
    seedServers([]);
    renderStarter();
    // The duplicate "Noch kein Server eingerichtet …" line is gone …
    expect(screen.queryByText(/Noch kein Server eingerichtet/)).toBeNull();
    // … and so is the starter's own "Server anlegen" button (that CTA lives once,
    // on the dashboard welcome card).
    expect(screen.queryByRole("link", { name: "Server anlegen" })).toBeNull();
    // The disabled project entry and the pointer "lege unten einen an" stay.
    expect(screen.getByTestId("starter-new-project-button")).toBeDisabled();
    expect(screen.getByTestId("starter-new-project-hint")).toBeInTheDocument();
  });

  it("keeps its own empty state when a server IS configured but has no sessions", async () => {
    seedServers([server]);
    renderStarter();
    await waitFor(() =>
      expect(screen.getByTestId("session-starter-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("session-starter-empty")).toHaveTextContent(
      "Keine Sessions auf diesem Server.",
    );
  });
});
