import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../lib/opencode.ts";
import { useLiveRefresh } from "./useLiveRefresh.ts";

const listeners = new Set<(event: unknown) => void>();

vi.mock("../lib/eventHub.ts", () => ({
  subscribeServerEvents: (_server: unknown, listener: (event: unknown) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
}));

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "",
  password: "",
};

function emit(event: unknown) {
  for (const listener of [...listeners]) listener(event);
}

describe("useLiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls on an interval and refreshes on hub events", () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => useLiveRefresh(server, reload, 1000));

    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(reload).toHaveBeenCalledTimes(3);

    emit({ type: "session.idle" });
    expect(reload).toHaveBeenCalledTimes(4);

    unmount();
    vi.advanceTimersByTime(5000);
    emit({ type: "session.idle" });
    expect(reload).toHaveBeenCalledTimes(4);
  });

  it("does nothing without a server", () => {
    const reload = vi.fn();
    renderHook(() => useLiveRefresh(null, reload, 1000));
    vi.advanceTimersByTime(5000);
    emit({ type: "session.idle" });
    expect(reload).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
