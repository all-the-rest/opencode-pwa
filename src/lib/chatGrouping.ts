/**
 * Messenger-style grouping for the chat (parity with the original's
 * `session-turn` / `message-timeline` grouping):
 *
 *   - **Day separators** ("Heute" / "Gestern" / date) whenever the calendar
 *     day changes between two messages.
 *   - **Consecutive messages of the same role** collapse into one visual
 *     group: tighter spacing, one meta line (and timestamp) per group, the
 *     bubble tail on the last message of the group. Grouping never splits by
 *     time — only the day separator and a status note break a run (WhatsApp
 *     parity): a long silence keeps one group, per owner decision ("Ohne
 *     Lücke", the former 30-minute gap rule was removed).
 *   - Status **notes never group** — they stay bare centered lines and break a
 *     run of bubbles, exactly like the original's `MessageDivider`.
 *
 * The day *labels* stay structural kinds here ("today" | "yesterday" |
 * "date"); the German wording is wrapped with Lingui in the component.
 */

import type { CachedMessage } from "./messageCache.ts";

export type ChatDayLabelKind = "today" | "yesterday" | "date";

export interface ChatDaySeparator {
  kind: "day";
  /** Stable key of the separator (the local calendar day). */
  key: string;
  label: ChatDayLabelKind;
  /** Formatted date for the `date` kind ("08.10.2026"). */
  date: string;
}

export interface ChatNoteRow {
  kind: "note";
  message: CachedMessage;
}

export interface ChatBubbleRow {
  kind: "bubble";
  message: CachedMessage;
  /** `true` for the user's own messages (right-aligned primary bubble). */
  own: boolean;
  /** First message of a group: renders the meta line and the timestamp. */
  groupStart: boolean;
  /** Last message of a group: renders the bubble tail. */
  groupEnd: boolean;
}

export type ChatRow = ChatDaySeparator | ChatNoteRow | ChatBubbleRow;

/** Local calendar day of a timestamp ("2026-10-08"), stable across grouping. */
export function chatDayKey(created: number): string {
  if (!Number.isFinite(created)) return "";
  const date = new Date(created);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Formatted date for the `date` day label ("08.10.2026"). */
export function formatChatDate(created: number): string {
  if (!Number.isFinite(created)) return "";
  return new Date(created).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Which day label a message gets relative to `now`: today, yesterday, or an
 * explicit date. Midnight-anchored, so a message from 23:58 still counts as
 * "yesterday" the next morning.
 */
export function chatDayLabel(created: number, now: number = Date.now()): ChatDayLabelKind {
  if (!Number.isFinite(created)) return "date";
  const startOfDay = (value: number): number => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(created)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return "date";
}

function isBubble(message: CachedMessage): boolean {
  return message.role === "user" || message.role === "assistant";
}

/**
 * Fold a message list (oldest first) into render rows: day separators plus
 * bubble groups. Notes pass through unchanged and break the current group.
 */
export function groupChatMessages(
  messages: readonly CachedMessage[],
  now: number = Date.now(),
): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDayKey = "";
  let lastBubbleIndex = -1;
  let lastRole = "";

  const closeGroup = (): void => {
    if (lastBubbleIndex < 0) return;
    const row = rows[lastBubbleIndex];
    if (row !== undefined && row.kind === "bubble") row.groupEnd = true;
    lastBubbleIndex = -1;
  };

  for (const message of messages) {
    const dayKey = chatDayKey(message.created);
    if (dayKey !== lastDayKey) {
      closeGroup();
      rows.push({
        kind: "day",
        key: dayKey === "" ? `day-${rows.length}` : dayKey,
        label: chatDayLabel(message.created, now),
        date: formatChatDate(message.created),
      });
      lastDayKey = dayKey;
      lastRole = "";
    }
    if (!isBubble(message)) {
      closeGroup();
      rows.push({ kind: "note", message });
      lastRole = "";
      continue;
    }
    const continuesGroup = lastBubbleIndex >= 0 && lastRole === message.role;
    if (continuesGroup) {
      const previous = rows[lastBubbleIndex];
      if (previous !== undefined && previous.kind === "bubble") previous.groupEnd = false;
    } else {
      closeGroup();
    }
    rows.push({
      kind: "bubble",
      message,
      own: message.role === "user",
      groupStart: !continuesGroup,
      groupEnd: true,
    });
    lastBubbleIndex = rows.length - 1;
    lastRole = message.role;
  }
  closeGroup();
  return rows;
}
