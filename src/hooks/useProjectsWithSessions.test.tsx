import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSessionsPaged,
  type ApiResult,
  type ServerConfig,
  type SessionPage,
  type SessionRow,
} from "../lib/opencode.ts";
import {
  resetProjectSessionProbesForTests,
  SESSION_PROBE_LIMIT,
  useProjectsWithSessions,
} from "./useProjectsWithSessions.ts";

// No live polling / event stream in unit tests — the probe itself is the focus.
vi.mock("./useLiveRefresh.ts", () => ({
  useLiveRefresh: () => {},
  LIVE_REFRESH_INTERVAL_MS: 5000,
}));

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  // Only the API wrapper is stubbed; the types (and the pure helpers) stay real.
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return {
    ...actual,
    listSessionsPaged: vi.fn(),
  };
});

const listSessionsPagedMock = vi.mocked(listSessionsPaged);

const server: ServerConfig = {
  id: "srv-1",
  name: "Lokal",
  baseUrl: "http://x.local",
  username: "",
};
const otherServer: ServerConfig = { ...server, id: "srv-2", name: "Anders" };

function session(id: string, projectKey: string | null): SessionRow {
  return { id, label: `Session ${id}`, projectKey, agent: null, created: null };
}

function page(rows: SessionRow[]): ApiResult<SessionPage> {
  return { data: { rows, cursor: { next: null, previous: null } }, error: null };
}

describe("useProjectsWithSessions", () => {
  beforeEach(() => {
    // Probe entries are module state and outlive their subscribers — every test
    // starts without one, exactly like a fresh app boot.
    resetProjectSessionProbesForTests();
    listSessionsPagedMock.mockReset();
  });

  it("asks for the wide window (1000 rows), not the page size of either view", async () => {
    listSessionsPagedMock.mockResolvedValue(page([]));
    const { result } = renderHook(() => useProjectsWithSessions(server));

    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionsPagedMock).toHaveBeenCalledWith(server, {
      limit: SESSION_PROBE_LIMIT,
    });
    expect(SESSION_PROBE_LIMIT).toBe(1000);
    expect(result.current.loaded).toBe(true);
  });

  it("hides nothing while the probe is in flight (unknown ≠ empty)", async () => {
    let resolveProbe: (result: ApiResult<SessionPage>) => void = () => {};
    listSessionsPagedMock.mockImplementation(
      () =>
        new Promise<ApiResult<SessionPage>>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const { result } = renderHook(() => useProjectsWithSessions(server));

    // First render: nothing known, so nothing may be filtered on it.
    expect(result.current.sessionProjectIDs.size).toBe(0);
    expect(result.current.loaded).toBe(false);
    expect(result.current.failed).toBe(false);

    await act(async () => {
      resolveProbe(page([session("s1", "p-active")]));
      await Promise.resolve();
    });
    expect(result.current.loaded).toBe(true);
    expect(result.current.failed).toBe(false);
    expect([...result.current.sessionProjectIDs]).toEqual(["p-active"]);
  });

  it("reduces the probed rows to the set of project keys", async () => {
    listSessionsPagedMock.mockResolvedValue(
      page([session("s1", "p-active"), session("s2", "p-active"), session("s3", "p-late")]),
    );
    const { result } = renderHook(() => useProjectsWithSessions(server));

    await act(async () => {
      await Promise.resolve();
    });
    expect([...result.current.sessionProjectIDs].sort()).toEqual(["p-active", "p-late"]);
  });

  it("ignores session rows without a project key (they belong to no project)", async () => {
    listSessionsPagedMock.mockResolvedValue(page([session("s1", null), session("s2", "")]));
    const { result } = renderHook(() => useProjectsWithSessions(server));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.sessionProjectIDs.size).toBe(0);
    // Resolved with zero keys: that IS the truth now (a server without
    // sessions), not a failure.
    expect(result.current.loaded).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it("fails open on a failed probe: no keys, nothing to hide on", async () => {
    listSessionsPagedMock.mockResolvedValue({ data: null, error: "offline" });
    const { result } = renderHook(() => useProjectsWithSessions(server));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.sessionProjectIDs.size).toBe(0);
    expect(result.current.loaded).toBe(false);
    expect(result.current.failed).toBe(true);
  });

  it("treats an answer without rows as unknown, not as an empty server", async () => {
    listSessionsPagedMock.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useProjectsWithSessions(server));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loaded).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("costs ONE request per server even when both views subscribe", async () => {
    listSessionsPagedMock.mockResolvedValue(page([session("s1", "p-active")]));
    // Sidebar and server page are mounted at the same time in the real layout.
    const sidebar = renderHook(() => useProjectsWithSessions(server));
    const serverPage = renderHook(() => useProjectsWithSessions(server));

    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionsPagedMock).toHaveBeenCalledTimes(1);
    // Both read the same answer.
    expect(sidebar.result.current.loaded).toBe(true);
    expect(serverPage.result.current.loaded).toBe(true);
    expect([...serverPage.result.current.sessionProjectIDs]).toEqual(["p-active"]);
  });

  it("probes again with the rows of the newly selected server", async () => {
    listSessionsPagedMock.mockImplementation((active: ServerConfig) =>
      Promise.resolve(page([session("s1", active.id === "srv-2" ? "p-anderes" : "p-lokal")])),
    );
    const { result, rerender } = renderHook(
      ({ active }: { active: ServerConfig | null }) => useProjectsWithSessions(active),
      { initialProps: { active: server as ServerConfig | null } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect([...result.current.sessionProjectIDs]).toEqual(["p-lokal"]);

    rerender({ active: otherServer });
    await act(async () => {
      await Promise.resolve();
    });
    expect(listSessionsPagedMock).toHaveBeenLastCalledWith(otherServer, {
      limit: SESSION_PROBE_LIMIT,
    });
    expect([...result.current.sessionProjectIDs]).toEqual(["p-anderes"]);
  });

  it("stays unknown without a selected server and sends no request", async () => {
    listSessionsPagedMock.mockResolvedValue(page([]));
    const { result } = renderHook(() => useProjectsWithSessions(null));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loaded).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(listSessionsPagedMock).not.toHaveBeenCalled();
  });
});
