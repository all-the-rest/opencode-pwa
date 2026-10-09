import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCacheForTests, readMessages, type CachedMessage } from "../lib/messageCache.ts";
import { listMessages, type ServerConfig } from "../lib/opencode.ts";
import { useSessionMessages } from "./useSessionMessages.ts";

/**
 * Live delta folding in the message model: what `session.*.delta` frames do to
 * the in-memory chat (grow the row, create it when needed) and — crucially —
 * what they must *not* do: reach the cache. A half-streamed row is not a final
 * message, so a reload mid-run may not resurrect it.
 */

// The event hub mock keeps the listener so a test can push raw SSE frames.
const hub = vi.hoisted(() => ({
  listener: null as null | ((event: unknown) => void),
}));

vi.mock("../lib/opencode.ts", () => ({
  listMessages: vi.fn(),
}));

vi.mock("../lib/eventHub.ts", () => ({
  subscribeServerEvents: (_server: unknown, listener: (event: unknown) => void) => {
    hub.listener = listener;
    return () => {
      hub.listener = null;
    };
  },
}));

const mockedListMessages = vi.mocked(listMessages);

const server: ServerConfig = {
  id: "srv",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "",
};

const SESSION = "ses";

/** A session with exactly one user message and no assistant turn yet. */
function userOnly() {
  return {
    data: [{ type: "user", id: "u1", text: "Erzähl mir was", time: { created: 1000 } }],
    cursor: {},
  };
}

function frame(type: string, data: Record<string, unknown>, created?: number) {
  return { type, ...(created !== undefined ? { created } : {}), data: { sessionID: SESSION, ...data } };
}

function reasoningFrame(ordinal: number, delta: string) {
  return frame("session.reasoning.delta", { assistantMessageID: "a-1", ordinal, delta });
}

function textFrame(ordinal: number, delta: string) {
  return frame("session.text.delta", { assistantMessageID: "a-1", ordinal, delta });
}

function toolInputFrame(callID: string, delta: string) {
  return frame("session.tool.input.delta", { assistantMessageID: "a-1", id: callID, delta });
}

/** Push raw frames through the mocked hub, inside `act`. */
function emit(...events: unknown[]): void {
  const listener = hub.listener;
  if (listener === null) throw new Error("no event subscription");
  act(() => {
    for (const event of events) listener(event);
  });
}

async function mounted() {
  const view = renderHook(() => useSessionMessages(server, SESSION, 25));
  await waitFor(() => {
    expect(view.result.current.loading).toBe(false);
  });
  return view;
}

function assistantRow(visible: readonly CachedMessage[]): CachedMessage | undefined {
  return visible.find((row) => row.messageID === "a-1");
}

beforeEach(() => {
  clearMemoryCacheForTests();
  mockedListMessages.mockReset();
  const response = { data: userOnly().data, error: null } as unknown as Awaited<
    ReturnType<typeof listMessages>
  >;
  mockedListMessages.mockResolvedValue(response);
});

describe("useSessionMessages with live deltas", () => {
  it("grows the reasoning live and never persists the streamed row", async () => {
    const { result } = await mounted();
    expect(assistantRow(result.current.visible)).toBeUndefined();

    // The measured turn: reasoning frames in high frequency, no snapshot.
    emit(
      frame("session.execution.started", {}),
      reasoningFrame(0, "Ich "),
      reasoningFrame(0, "überlege "),
      reasoningFrame(0, "mir das."),
    );

    const streamed = assistantRow(result.current.visible);
    expect(streamed).toBeDefined();
    expect(streamed?.parts).toEqual([{ kind: "reasoning", text: "Ich überlege mir das.", live: true }]);
    // The working row retires: `liveCount` moved and the run state sees content.
    expect(result.current.liveCount).toBeGreaterThan(0);
    // Nothing reached the cache — a reload must not resurrect half of it.
    const stored = await readMessages("srv", SESSION);
    expect(stored.some((row) => row.messageID === "a-1")).toBe(false);
  });

  it("keeps identity of the untouched rows across a frame", async () => {
    const { result } = await mounted();
    emit(reasoningFrame(0, "erst"));
    const before = result.current.visible.slice();
    emit(reasoningFrame(0, "er Gedanke"));
    const after = result.current.visible;
    // The user row is literally the same object: React skips it.
    expect(after[0]).toBe(before[0]);
    expect(assistantRow(after)?.parts).toEqual([
      { kind: "reasoning", text: "erster Gedanke", live: true },
    ]);
  });

  it("lets an authoritative snapshot replace the streamed row wholesale", async () => {
    const { result } = await mounted();
    emit(reasoningFrame(0, "ungefäh"), textFrame(1, "Halb"));

    emit(
      frame("session.message.content.updated", {
        messageID: "a-1",
        content: [
          { type: "reasoning", text: "ungefähre Überlegung" },
          { type: "text", text: "Fertig." },
        ],
      }),
    );

    // No `live` markers, no leftover delta text: the snapshot wins entirely.
    expect(assistantRow(result.current.visible)?.parts).toEqual([
      { kind: "reasoning", text: "ungefähre Überlegung" },
      { kind: "text", text: "Fertig." },
    ]);
    // Now it is final, so it may be persisted.
    const stored = await readMessages("srv", SESSION);
    expect(stored.some((row) => row.messageID === "a-1")).toBe(true);
  });

  it("accumulates a tool input delta onto the call it names", async () => {
    const { result } = await mounted();
    // The snapshot that announces the tool call (with its arguments still empty).
    emit(
      frame("session.message.content.updated", {
        messageID: "a-1",
        content: [
          {
            type: "tool",
            id: "call_1",
            name: "read",
            state: { status: "running", input: {} },
          },
        ],
      }),
    );

    emit(toolInputFrame("call_1", '{"filePath":'), toolInputFrame("call_1", '"/a.ts"}'));

    const streamed = assistantRow(result.current.visible);
    const tool = streamed?.parts[0];
    expect(tool?.kind).toBe("tool");
    expect(tool?.kind === "tool" && tool.input).toEqual({ filePath: "/a.ts" });

    // A frame for a different call leaves the card alone.
    emit(toolInputFrame("call_andere", '{"x":1}'));
    const after = assistantRow(result.current.visible)?.parts[0];
    expect(after?.kind === "tool" && after.input).toEqual({ filePath: "/a.ts" });
  });

  it("ignores delta frames of other sessions", async () => {
    const { result } = await mounted();
    emit({
      type: "session.reasoning.delta",
      data: { sessionID: "andere", assistantMessageID: "a-9", ordinal: 0, delta: "fremd" },
    });
    expect(assistantRow(result.current.visible)).toBeUndefined();
  });
});
