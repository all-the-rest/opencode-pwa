/**
 * Elapsed-runtime formatting for the "wie lange läuft das" surfaces (running
 * strip, agent overview). Kept pure so the tick and the label are testable
 * without a clock: callers pass `now` (from a ticking hook) and a start
 * timestamp (`time.created` / `time.updated`).
 *
 * Format (messenger-class, tabular-friendly):
 *   - under an hour  → `m:ss`      ("4:12")
 *   - an hour or more → `h:mm:ss`  ("1:04:12")
 */

/** Clamp a raw millisecond delta into a renderable runtime (never negative). */
export function runtimeMs(startedAt: number | null, now: number): number | null {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return null;
  const delta = Math.floor(now - startedAt);
  return delta > 0 ? delta : 0;
}

/** Elapsed runtime as `m:ss` / `h:mm:ss`; null when no start is known. */
export function formatRuntime(deltaMs: number | null): string | null {
  if (deltaMs === null || !Number.isFinite(deltaMs)) return null;
  const totalSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Elapsed runtime label ("4:12") or null when no start is known. */
export function runtimeLabel(startedAt: number | null, now: number): string | null {
  return formatRuntime(runtimeMs(startedAt, now));
}

/** Wall-clock start of a run ("11:48") or null when no start is known. */
export function formatStartedAt(startedAt: number | null): string | null {
  if (startedAt === null || !Number.isFinite(startedAt)) return null;
  return new Date(startedAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
