/**
 * Per-server color coding (owner requirement): every server gets a color from
 * a fixed, user-pickable palette. Stored on the server entry (`color`); old
 * entries without a color fall back to a hash-derived default, so parsing
 * stays tolerant. Pure module, unit-testable without rendering.
 */

/** User-pickable palette (hex colors, daisyUI-friendly saturated tones). */
export const SERVER_COLOR_PALETTE: readonly string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** True when `value` is one of the palette colors. */
export function isServerColor(value: unknown): value is string {
  return typeof value === "string" && SERVER_COLOR_PALETTE.includes(value);
}

/**
 * Hash-derived default color for a server id. Deterministic (FNV-1a over the
 * id string, modulo palette size), so old entries without a stored color
 * always render the same dot.
 */
export function defaultServerColor(serverId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < serverId.length; i++) {
    hash ^= serverId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = Math.abs(hash) % SERVER_COLOR_PALETTE.length;
  return SERVER_COLOR_PALETTE[index] ?? SERVER_COLOR_PALETTE[0] ?? "#3b82f6";
}

interface ColoredServer {
  id: string;
  color?: unknown;
}

/** Effective color of a server: stored palette color, else hash default. */
export function serverColor(server: ColoredServer): string {
  if (isServerColor(server.color)) return server.color;
  return defaultServerColor(server.id);
}

/** Normalize a stored `color` value: palette entry or `undefined`. */
export function parseServerColor(value: unknown): string | undefined {
  return isServerColor(value) ? value : undefined;
}
