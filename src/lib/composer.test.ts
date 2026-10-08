import { describe, expect, it } from "vitest";
import { COMPOSER_MAX_HEIGHT, clampComposerHeight, composerTextareaScrolls } from "./composer.ts";

describe("clampComposerHeight", () => {
  it("grows with the content up to the max height", () => {
    expect(clampComposerHeight(40)).toBe(40);
    expect(clampComposerHeight(120)).toBe(120);
    expect(clampComposerHeight(COMPOSER_MAX_HEIGHT)).toBe(COMPOSER_MAX_HEIGHT);
  });

  it("clamps taller content and reports that the editor must scroll", () => {
    expect(clampComposerHeight(420)).toBe(COMPOSER_MAX_HEIGHT);
    expect(composerTextareaScrolls(COMPOSER_MAX_HEIGHT)).toBe(true);
    expect(composerTextareaScrolls(COMPOSER_MAX_HEIGHT - 1)).toBe(false);
  });

  it("respects a custom max", () => {
    expect(clampComposerHeight(400, 100)).toBe(100);
  });

  it("collapses unusable measurements to 0 (jsdom, hidden node)", () => {
    expect(clampComposerHeight(0)).toBe(0);
    expect(clampComposerHeight(-12)).toBe(0);
    expect(clampComposerHeight(Number.NaN)).toBe(0);
  });
});
