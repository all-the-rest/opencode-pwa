import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheKey,
  clearMemoryCacheForTests,
  clearSessionMessages,
  evictOldest,
  extractMessageInputs,
  MAX_MESSAGES_PER_SESSION,
  mergeMessageLists,
  putMessages,
  readMessages,
  sessionCacheKey,
  toCachedMessages,
} from "./messageCache.ts";

const SERVER = "server-1";
const SESSION = "session-1";

function input(id: number, created: number) {
  return { id: `msg-${id}`, role: id % 2 === 0 ? "assistant" : "user", text: `Text ${id}`, created };
}

beforeEach(() => {
  clearMemoryCacheForTests();
});

describe("cache keys", () => {
  it("uses serverID:sessionID:messageID", () => {
    expect(cacheKey("srv", "ses", "msg")).toBe("srv:ses:msg");
    expect(sessionCacheKey("srv", "ses")).toBe("srv:ses");
  });
});

describe("extractMessageInputs", () => {
  it("supports { data } envelopes and plain arrays", () => {
    const payload = { data: [{ id: "a", role: "user", text: "Hallo" }] };
    const rows = extractMessageInputs(payload, 1000);
    expect(rows).toEqual([{ id: "a", role: "user", text: "Hallo", created: 1000 }]);
    expect(extractMessageInputs([{ id: "b" }], 500)[0]).toMatchObject({ id: "b" });
  });

  it("falls back for missing fields and keeps payload order as recency", () => {
    const rows = extractMessageInputs({ messages: [{}, { role: "assistant", content: "Hi" }] }, 1000);
    expect(rows[0]).toMatchObject({ id: "nachricht-0", role: "unbekannt" });
    expect(rows[1]).toMatchObject({ role: "assistant", text: "Hi" });
    expect(rows[0]?.created).toBeLessThan(rows[1]?.created ?? 0);
  });

  it("returns an empty list for unknown shapes", () => {
    expect(extractMessageInputs(null)).toEqual([]);
    expect(extractMessageInputs({ data: "nope" })).toEqual([]);
  });
});

describe("evictOldest", () => {
  it("keeps the newest entries up to the limit", () => {
    const rows = toCachedMessages(
      SERVER,
      SESSION,
      Array.from({ length: 10 }, (_, i) => input(i + 1, 1000 + i)),
    );
    const kept = evictOldest(rows, 3);
    expect(kept.map((m) => m.messageID)).toEqual(["msg-10", "msg-9", "msg-8"]);
  });

  it("returns an empty list for non-positive limits", () => {
    expect(evictOldest(toCachedMessages(SERVER, SESSION, [input(1, 1)]), 0)).toEqual([]);
  });
});

describe("mergeMessageLists", () => {
  it("dedupes by id with incoming winning and caps the size", () => {
    const cached = toCachedMessages(SERVER, SESSION, [input(1, 100), input(2, 200)]);
    const incoming = toCachedMessages(SERVER, SESSION, [
      { id: "msg-2", role: "assistant", text: "Aktualisiert", created: 300 },
      input(3, 250),
    ]);
    const merged = mergeMessageLists(cached, incoming);
    expect(merged.map((m) => m.messageID)).toEqual(["msg-2", "msg-3", "msg-1"]);
    expect(merged.find((m) => m.messageID === "msg-2")?.text).toBe("Aktualisiert");
  });

  it("merges a live event over fetched messages", () => {
    const fetched = toCachedMessages(SERVER, SESSION, [input(1, 100), input(2, 200)]);
    const liveEvent = toCachedMessages(SERVER, SESSION, [
      { id: "msg-3", role: "assistant", text: "Live-Antwort", created: 300 },
    ]);
    const merged = mergeMessageLists(fetched, liveEvent);
    expect(merged.map((m) => m.messageID)).toEqual(["msg-3", "msg-2", "msg-1"]);
  });
});

describe("putMessages / readMessages", () => {
  it("round-trips newest-first", async () => {
    await putMessages(SERVER, SESSION, [input(1, 100), input(2, 200)]);
    const rows = await readMessages(SERVER, SESSION);
    expect(rows.map((m) => m.messageID)).toEqual(["msg-2", "msg-1"]);
  });

  it("evicts older entries beyond the per-session limit", async () => {
    const total = MAX_MESSAGES_PER_SESSION + 50;
    await putMessages(
      SERVER,
      SESSION,
      Array.from({ length: total }, (_, i) => input(i + 1, 1000 + i)),
    );
    const rows = await readMessages(SERVER, SESSION);
    expect(rows).toHaveLength(MAX_MESSAGES_PER_SESSION);
    expect(rows[0]?.messageID).toBe(`msg-${total}`);
    expect(rows[rows.length - 1]?.messageID).toBe("msg-51");
  });

  it("keeps sessions isolated", async () => {
    await putMessages(SERVER, "session-a", [input(1, 100)]);
    await putMessages(SERVER, "session-b", [input(2, 200)]);
    expect((await readMessages(SERVER, "session-a")).map((m) => m.messageID)).toEqual(["msg-1"]);
    expect((await readMessages(SERVER, "session-b")).map((m) => m.messageID)).toEqual(["msg-2"]);
  });

  it("clears a single session", async () => {
    await putMessages(SERVER, SESSION, [input(1, 100)]);
    await clearSessionMessages(SERVER, SESSION);
    expect(await readMessages(SERVER, SESSION)).toEqual([]);
  });
});
