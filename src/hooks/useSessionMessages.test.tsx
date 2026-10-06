import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCacheForTests } from "../lib/messageCache.ts";
import type { ServerConfig } from "../lib/opencode.ts";
import { useSessionMessages } from "./useSessionMessages.ts";
import { listMessages } from "../lib/opencode.ts";

vi.mock("../lib/opencode.ts", () => ({
  listMessages: vi.fn(),
}));

vi.mock("../lib/eventHub.ts", () => ({
  subscribeServerEvents: () => () => {},
}));

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "",
};

const mockedListMessages = vi.mocked(listMessages);

function payload(count: number) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      id: `msg-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      text: `Nachricht ${index + 1}`,
    })),
    cursor: {},
  };
}

beforeEach(() => {
  clearMemoryCacheForTests();
  mockedListMessages.mockReset();
  // Payload nur mit den Feldern, die `extractMessageInputs` liest (`id`,
  // `role`, `text`); der Rest wird für den Hook-Test wegtypisiert.
  const response = { data: payload(60), error: null } as unknown as Awaited<
    ReturnType<typeof listMessages>
  >;
  mockedListMessages.mockResolvedValue(response);
});

describe("useSessionMessages (chat style)", () => {
  it("zeigt das neueste Fenster aelteste-zuerst, neueste unten", async () => {
    const { result } = renderHook(() => useSessionMessages(server, "ses-1", 25));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.total).toBe(60);
    expect(result.current.visible).toHaveLength(25);
    expect(result.current.visible[0]?.messageID).toBe("msg-36");
    expect(result.current.visible[24]?.messageID).toBe("msg-60");
    expect(result.current.hasMore).toBe(true);
  });

  it("laedt aeltere Nachrichten oben nach", async () => {
    const { result } = renderHook(() => useSessionMessages(server, "ses-1", 25));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.visible).toHaveLength(50);
    expect(result.current.visible[0]?.messageID).toBe("msg-11");
    expect(result.current.visible[49]?.messageID).toBe("msg-60");
  });

  it("haengt lokale Nachrichten unten an", async () => {
    const { result } = renderHook(() => useSessionMessages(server, "ses-1", 25));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let localID = "";
    act(() => {
      localID = result.current.addLocalMessage("user", "Hallo");
    });

    const last = result.current.visible[result.current.visible.length - 1];
    expect(last?.messageID).toBe(localID);
    expect(last?.text).toBe("Hallo");

    act(() => {
      result.current.dropLocalMessage(localID);
    });
    expect(result.current.visible[result.current.visible.length - 1]?.messageID).toBe("msg-60");
  });
});
