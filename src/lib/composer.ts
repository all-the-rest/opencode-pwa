/**
 * Composer sizing rules (the original grows its editor to `max-h-[180px]`
 * and then scrolls). Kept free of DOM access so the clamp is testable.
 */

/** Tallest the composer textarea grows to before it starts scrolling. */
export const COMPOSER_MAX_HEIGHT = 180;

/**
 * Height the textarea should take for a measured `scrollHeight`: the content
 * height, capped at `max`. Non-positive/NaN measurements (jsdom, a hidden
 * node) collapse to 0 so the caller keeps its own default styling.
 */
export function clampComposerHeight(scrollHeight: number, max: number = COMPOSER_MAX_HEIGHT): number {
  if (!Number.isFinite(scrollHeight) || scrollHeight <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return scrollHeight;
  return Math.min(scrollHeight, max);
}

/** True once the measured content no longer fits — the textarea must scroll. */
export function composerTextareaScrolls(scrollHeight: number, max: number = COMPOSER_MAX_HEIGHT): boolean {
  return clampComposerHeight(scrollHeight, max) >= max;
}
