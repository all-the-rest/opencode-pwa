import { describe, expect, it } from "vitest";
import {
  CHAT_GROUP_GAP_MS,
  chatDayKey,
  chatDayLabel,
  formatChatDate,
  groupChatMessages,
  type ChatRow,
} from "./chatGrouping.ts";
import type { CachedMessage } from "./messageCache.ts";

/**
 * Messenger grouping (day separators, consecutive-message groups). Fake
 * timestamps anchor on a fixed "now" so the day labels stay deterministic.
 */

const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime();
const DAY = 86_400_000;

function message(
  id: string,
  role: "user" | "assistant" | "note",
  created: number,
  extra: Partial<CachedMessage> = {},
): CachedMessage {
  return {
    key: `k-${id}`,
    sessionKey: "s",
    serverID: "srv",
    sessionID: "ses",
    messageID: id,
    role,
    text: role === "note" ? "" : `text ${id}`,
    created,
    noteKind: role === "note" ? "idle" : null,
    noteDetail: null,
    parts: role === "note" ? [] : [{ kind: "text", text: `text ${id}` }],
    agent: null,
    model: null,
    durationMs: null,
    ...extra,
  };
}

function rows(...messages: CachedMessage[]): ChatRow[] {
  return groupChatMessages(messages, NOW);
}

describe("chatDayKey / chatDayLabel", () => {
  it("keys days by the local calendar day", () => {
    expect(chatDayKey(NOW)).toBe(chatDayKey(NOW + 3_600_000));
    expect(chatDayKey(NOW)).not.toBe(chatDayKey(NOW + DAY));
  });

  it("labels today, yesterday and older dates", () => {
    expect(chatDayLabel(NOW - 60_000, NOW)).toBe("today");
    expect(chatDayLabel(NOW - DAY - 60_000, NOW)).toBe("yesterday");
    expect(chatDayLabel(NOW - 5 * DAY, NOW)).toBe("date");
  });

  it("keeps a late-evening message on its own day", () => {
    const lateEvening = new Date(2026, 9, 7, 23, 58).getTime();
    expect(chatDayLabel(lateEvening, NOW)).toBe("yesterday");
  });

  it("formats the date label in German locale", () => {
    expect(formatChatDate(NOW)).toMatch(/08\.10\.2026/);
  });
});

describe("groupChatMessages", () => {
  it("inserts a day separator before the first message and on day changes", () => {
    const result = rows(
      message("a", "user", NOW - DAY),
      message("b", "assistant", NOW - DAY + 60_000),
      message("c", "user", NOW),
    );
    const days = result.filter((row) => row.kind === "day");
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ kind: "day", label: "yesterday" });
    expect(days[1]).toMatchObject({ kind: "day", label: "today" });
  });

  it("groups consecutive messages of the same role", () => {
    const result = rows(
      message("u1", "user", NOW - 120_000),
      message("u2", "user", NOW - 60_000),
      message("a1", "assistant", NOW - 30_000),
    );
    const bubbles = result.flatMap((row) => (row.kind === "bubble" ? [row] : []));
    expect(bubbles.map((row) => [row.message.messageID, row.groupStart, row.groupEnd])).toEqual([
      ["u1", true, false],
      ["u2", false, true],
      ["a1", true, true],
    ]);
    expect(bubbles[0]?.own).toBe(true);
    expect(bubbles[2]?.own).toBe(false);
  });

  it("keeps messages within the group gap inside one group", () => {
    const result = rows(
      message("u1", "user", NOW - 2 * CHAT_GROUP_GAP_MS),
      message("u2", "user", NOW - CHAT_GROUP_GAP_MS),
    );
    const bubbles = result.flatMap((row) => (row.kind === "bubble" ? [row] : []));
    expect(bubbles.map((row) => row.groupStart)).toEqual([true, false]);
  });

  it("starts a new group after a long silence", () => {
    const result = rows(
      message("u1", "user", NOW - 3 * CHAT_GROUP_GAP_MS - 1000),
      message("u2", "user", NOW - 2 * CHAT_GROUP_GAP_MS - 500),
      message("u3", "user", NOW),
    );
    const starts = result.flatMap((row) =>
      row.kind === "bubble" && row.groupStart ? [row.message.messageID] : [],
    );
    expect(starts).toEqual(["u1", "u2", "u3"]);
  });

  it("keeps notes standalone and breaks the surrounding group", () => {
    const result = rows(
      message("u1", "user", NOW - 120_000),
      message("n1", "note", NOW - 90_000),
      message("u2", "user", NOW - 60_000),
    );
    expect(result.map((row) => row.kind)).toEqual(["day", "bubble", "note", "bubble"]);
    const bubbles = result.flatMap((row) => (row.kind === "bubble" ? [row] : []));
    expect(bubbles.every((row) => row.groupStart && row.groupEnd)).toBe(true);
  });

  it("marks exactly the last bubble of every group", () => {
    const result = rows(
      message("u1", "user", NOW - 300_000),
      message("u2", "user", NOW - 240_000),
      message("a1", "assistant", NOW - 180_000),
      message("a2", "assistant", NOW - 120_000),
    );
    const ends = result.flatMap((row) =>
      row.kind === "bubble" && row.groupEnd ? [row.message.messageID] : [],
    );
    expect(ends).toEqual(["u2", "a2"]);
  });

  it("returns no rows for an empty list", () => {
    expect(groupChatMessages([], NOW)).toEqual([]);
  });
});
