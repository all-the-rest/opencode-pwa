import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeEventHubCountForTests,
  idleSessionRunState,
  reduceSessionRunState,
  resetEventHubsForTests,
  resetSessionRunStatesForTests,
  subscribeServerEvents,
  subscribeServerRunState,
  type SessionRunState,
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
};

afterEach(() => {
  resetEventHubsForTests();
  resetSessionRunStatesForTests();
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

describe("reduceSessionRunState", () => {
  const started = { type: "session.execution.started", data: { sessionID: "s" } };
  const content = (messageID: string) => ({
    type: "session.message.content.updated",
    data: { sessionID: "s", messageID, content: [] },
  });
  const succeeded = { type: "session.execution.succeeded", data: { sessionID: "s" } };

  it("moves idle → active on execution.started and back on succeeded", () => {
    let state: SessionRunState = idleSessionRunState("s");
    state = reduceSessionRunState(state, started);
    expect(state.status).toBe("active");
    state = reduceSessionRunState(state, succeeded);
    expect(state.status).toBe("idle");
  });

  it("ignores events for other sessions and unknown/empty events", () => {
    const state = idleSessionRunState("s");
    expect(reduceSessionRunState(state, { type: "session.execution.started", data: { sessionID: "other" } })).toBe(state);
    expect(reduceSessionRunState(state, { type: "session.idle" })).toBe(state);
    expect(reduceSessionRunState(state, null)).toBe(state);
    expect(reduceSessionRunState(state, { data: { sessionID: "s" } })).toBe(state);
  });

  it("records the streaming assistant id on content.updated (treats it as active)", () => {
    let state = reduceSessionRunState(idleSessionRunState("s"), content("a-7"));
    expect(state.status).toBe("active");
    expect(state.assistantMessageID).toBe("a-7");
    // A fresh started resets the id until parts arrive again.
    state = reduceSessionRunState(state, started);
    expect(state.status).toBe("active");
    expect(state.assistantMessageID).toBeNull();
  });

  it("captures the error message on execution.failed", () => {
    const state = reduceSessionRunState(idleSessionRunState("s"), {
      type: "session.execution.failed",
      data: { sessionID: "s", error: { type: "Provider", message: "quota exceeded" } },
    });
    expect(state.status).toBe("failed");
    expect(state.error).toBe("quota exceeded");
  });

  it("moves to interrupted on execution.interrupted", () => {
    const state = reduceSessionRunState(idleSessionRunState("s"), {
      type: "session.execution.interrupted",
      data: { sessionID: "s", reason: "user" },
    });
    expect(state.status).toBe("interrupted");
  });

  it("captures attempt, countdown time and provider message on retry.scheduled", () => {
    const state = reduceSessionRunState(idleSessionRunState("s"), {
      type: "session.retry.scheduled",
      data: {
        sessionID: "s",
        assistantMessageID: "a-1",
        attempt: 3,
        at: 1_700_000_000_000,
        error: { type: "TooManyRequests", message: "rate limited" },
      },
    });
    expect(state.status).toBe("retry");
    expect(state.retry).toEqual({ attempt: 3, at: 1_700_000_000_000, message: "rate limited" });
  });

  it("returns to active when a retry attempt streams content", () => {
    let state = reduceSessionRunState(idleSessionRunState("s"), {
      type: "session.retry.scheduled",
      data: { sessionID: "s", attempt: 1, at: 1, error: { message: "x" } },
    });
    expect(state.status).toBe("retry");
    state = reduceSessionRunState(state, content("a-2"));
    expect(state.status).toBe("active");
    expect(state.retry).toBeNull();
  });

  it("records the streaming assistant id from a delta and keeps the frame flood cheap", () => {
    // A measured turn produced 92 reasoning frames in 12 s with no snapshot at
    // all, so the working row has to retire on the delta, not on a snapshot.
    const delta = (ordinal: number, text: string) => ({
      type: "session.reasoning.delta",
      data: { sessionID: "s", assistantMessageID: "a-3", ordinal, delta: text },
    });
    let state = reduceSessionRunState(idleSessionRunState("s"), started);
    expect(state.assistantMessageID).toBeNull();
    state = reduceSessionRunState(state, delta(0, "ich "));
    expect(state.status).toBe("active");
    expect(state.assistantMessageID).toBe("a-3");
    // Every further frame returns the *same* object: no subscriber churn.
    expect(reduceSessionRunState(state, delta(0, "denke "))).toBe(state);
    expect(reduceSessionRunState(state, delta(0, "nach"))).toBe(state);
    // A tool-input delta addresses the message the same way.
    const tool = reduceSessionRunState(idleSessionRunState("s"), {
      type: "session.tool.input.delta",
      data: { sessionID: "s", assistantMessageID: "a-4", id: "call_1", delta: "{}" },
    });
    expect(tool.assistantMessageID).toBe("a-4");
    // Frames for another session change nothing.
    expect(
      reduceSessionRunState(state, { type: "session.text.delta", data: { sessionID: "other", assistantMessageID: "a-9" } }),
    ).toBe(state);
  });
});

describe("subscribeServerRunState", () => {
  const server = {
    id: "run-server",
    name: "Run",
    baseUrl: "http://run.local",
    username: "",
  };

  it("delivers the current state immediately and updates on transitions", async () => {
    // For this test the stream emits one lifecycle event then (on reconnect)
    // falls back to the module mock, so the hub pump folds execution.started
    // into the stored run state exactly once.
    mockedSubscribe.mockImplementationOnce(async function* () {
      yield { type: "session.execution.started", data: { sessionID: "ses-run" } };
    });

    const seen: SessionRunState[] = [];
    const off = subscribeServerRunState(server, "ses-run", (state) => seen.push({ ...state }));
    const offStream = subscribeServerEvents(server, () => undefined);

    // Immediate delivery (idle) before any event.
    expect(seen[0]?.status).toBe("idle");
    await vi.waitFor(() => {
      expect(seen.at(-1)?.status).toBe("active");
    });

    offStream();
    off();
  });
});
