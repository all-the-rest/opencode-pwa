import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeEventHubCountForTests,
  resetEventHubsForTests,
  subscribeServerEvents,
} from "./eventHub.ts";
import { subscribeEvents } from "./opencode.ts";

vi.mock("./opencode.ts", () => ({
  subscribeEvents: vi.fn(async function* (_server: unknown, signal: unknown) {
    yield { type: "session.idle" };
    const abort = signal as AbortSignal;
    await new Promise<void>((resolve) => {
      if (abort.aborted) {
        resolve();
        return;
      }
      abort.addEventListener("abort", () => resolve(), { once: true });
    });
  }),
}));

const mockedSubscribe = vi.mocked(subscribeEvents);

const server = {
  id: "hub-server",
  name: "Hub",
  baseUrl: "http://localhost:4096",
  username: "",
  password: "",
};

afterEach(() => {
  resetEventHubsForTests();
  mockedSubscribe.mockClear();
});

describe("subscribeServerEvents", () => {
  it("shares exactly one stream per server across listeners", async () => {
    const seenA: unknown[] = [];
    const seenB: unknown[] = [];
    const offA = subscribeServerEvents(server, (event) => {
      seenA.push(event);
    });
    const offB = subscribeServerEvents(server, (event) => {
      seenB.push(event);
    });

    await vi.waitFor(() => {
      expect(seenA).toHaveLength(1);
      expect(seenB).toHaveLength(1);
    });
    expect(mockedSubscribe).toHaveBeenCalledTimes(1);
    expect(activeEventHubCountForTests()).toBe(1);

    offA();
    expect(activeEventHubCountForTests()).toBe(1);
    offB();
    expect(activeEventHubCountForTests()).toBe(0);
  });

  it("restarts the stream when the server config changes", async () => {
    const seen: unknown[] = [];
    const off = subscribeServerEvents(server, (event) => {
      seen.push(event);
    });
    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
    });

    const changed = { ...server, baseUrl: "http://localhost:5000" };
    const offChanged = subscribeServerEvents(changed, () => undefined);
    expect(activeEventHubCountForTests()).toBe(1);
    // The stale stream was aborted, the new config started its own stream.
    await vi.waitFor(() => {
      expect(mockedSubscribe).toHaveBeenCalledTimes(2);
    });

    off();
    offChanged();
    expect(activeEventHubCountForTests()).toBe(0);
  });
});
