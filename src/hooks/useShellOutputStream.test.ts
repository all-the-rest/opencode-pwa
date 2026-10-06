import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, ServerConfig, ShellOutput } from "../lib/opencode.ts";
import { SHELL_OUTPUT_POLL_INTERVAL_MS, useShellOutputStream } from "./useShellOutputStream.ts";

const getShellOutput = vi.fn();

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return {
    ...actual,
    getShellOutput: (server: unknown, id: string, cursor?: number) =>
      getShellOutput(server, id, cursor),
  };
});

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "",
};

function shellOutput(output: string, cursor: number, truncated = false): ShellOutput {
  return { output, cursor, truncated };
}

function ok(data: ShellOutput): ApiResult<ShellOutput> {
  return { data, error: null };
}

function fail(message: string): ApiResult<ShellOutput> {
  return { data: null, error: message };
}

describe("useShellOutputStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getShellOutput.mockReset();
    getShellOutput.mockImplementation(() => Promise.resolve(ok(shellOutput("", 12))));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Flush the in-flight poll and let React commit its state updates. */
  async function tick(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("tails output while open and stops polling on close", async () => {
    getShellOutput
      .mockResolvedValueOnce(ok(shellOutput("hallo\n", 6)))
      .mockResolvedValueOnce(ok(shellOutput("welt\n", 12)));
    const { result, rerender } = renderHook(
      ({ open }) => useShellOutputStream(server, "sh-1", open),
      { initialProps: { open: true } },
    );

    await tick(0);
    expect(getShellOutput).toHaveBeenCalledWith(server, "sh-1", undefined);
    expect(result.current.output).toBe("hallo\n");
    expect(result.current.cursor).toBe(6);
    expect(result.current.loading).toBe(false);
    expect(result.current.live).toBe(true);

    await tick(SHELL_OUTPUT_POLL_INTERVAL_MS);
    expect(getShellOutput).toHaveBeenLastCalledWith(server, "sh-1", 6);
    expect(result.current.output).toBe("hallo\nwelt\n");

    rerender({ open: false });
    expect(result.current.live).toBe(false);
    await tick(SHELL_OUTPUT_POLL_INTERVAL_MS * 3);
    expect(getShellOutput).toHaveBeenCalledTimes(2);
  });

  it("stops polling on unmount", async () => {
    const { unmount } = renderHook(() => useShellOutputStream(server, "sh-1", true));
    await tick(0);
    expect(getShellOutput).toHaveBeenCalledTimes(1);
    unmount();
    await tick(SHELL_OUTPUT_POLL_INTERVAL_MS * 3);
    expect(getShellOutput).toHaveBeenCalledTimes(1);
  });

  it("replaces the buffer when the server reports a truncation", async () => {
    getShellOutput
      .mockResolvedValueOnce(ok(shellOutput("langer text\n", 12)))
      .mockResolvedValueOnce(ok(shellOutput("neu\n", 5, true)));
    const { result } = renderHook(() => useShellOutputStream(server, "sh-1", true));
    await tick(0);
    expect(result.current.output).toBe("langer text\n");

    await tick(SHELL_OUTPUT_POLL_INTERVAL_MS);
    expect(result.current.output).toBe("neu\n");
    expect(result.current.truncated).toBe(true);
    expect(result.current.cursor).toBe(5);
  });

  it("appends even when the cursor restarts at zero (no truncation signalled)", async () => {
    getShellOutput
      .mockResolvedValueOnce(ok(shellOutput("a\n", 2)))
      .mockResolvedValueOnce(ok(shellOutput("b\n", 0)));
    const { result } = renderHook(() => useShellOutputStream(server, "sh-1", true));
    await tick(0);
    await tick(SHELL_OUTPUT_POLL_INTERVAL_MS);
    expect(result.current.output).toBe("a\nb\n");
  });

  it("surfaces an error and drops the live indicator", async () => {
    getShellOutput.mockResolvedValueOnce(fail("Server offline"));
    const { result } = renderHook(() => useShellOutputStream(server, "sh-1", true));
    await tick(0);
    expect(result.current.error).toBe("Server offline");
    expect(result.current.live).toBe(false);
  });

  it("does nothing while closed", async () => {
    renderHook(() => useShellOutputStream(server, "sh-1", false));
    await tick(SHELL_OUTPUT_POLL_INTERVAL_MS * 2);
    expect(getShellOutput).not.toHaveBeenCalled();
  });
});
