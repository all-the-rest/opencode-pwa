import { describe, expect, it } from "vitest";
import {
  formatRuntime,
  formatStartedAt,
  runtimeLabel,
  runtimeMs,
} from "./runtimeFormat.ts";

describe("runtimeMs", () => {
  it("measures the elapsed time since the start", () => {
    expect(runtimeMs(1000, 4000)).toBe(3000);
  });

  it("clamps a clock that runs ahead of the start to zero", () => {
    expect(runtimeMs(5000, 1000)).toBe(0);
  });

  it("returns null without a usable start", () => {
    expect(runtimeMs(null, 1000)).toBeNull();
    expect(runtimeMs(Number.NaN, 1000)).toBeNull();
    expect(runtimeMs(1000, Number.NaN)).toBeNull();
  });
});

describe("formatRuntime", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatRuntime(0)).toBe("0:00");
    expect(formatRuntime(7_000)).toBe("0:07");
    expect(formatRuntime(252_000)).toBe("4:12");
    expect(formatRuntime(3_599_000)).toBe("59:59");
  });

  it("formats an hour and beyond as h:mm:ss", () => {
    expect(formatRuntime(3_600_000)).toBe("1:00:00");
    expect(formatRuntime(3_723_000)).toBe("1:02:03");
    expect(formatRuntime(45_290_000)).toBe("12:34:50");
  });

  it("never shows negative runtimes", () => {
    expect(formatRuntime(-5_000)).toBe("0:00");
  });

  it("returns null when no runtime is known", () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(Number.NaN)).toBeNull();
  });
});

describe("runtimeLabel", () => {
  it("combines start and now into one label", () => {
    expect(runtimeLabel(1_000, 61_000)).toBe("1:00");
    expect(runtimeLabel(1_000, 7_300_000)).toBe("2:01:39");
  });

  it("has no label without a start", () => {
    expect(runtimeLabel(null, 1_000)).toBeNull();
  });
});

describe("formatStartedAt", () => {
  it("renders the wall-clock start in German locale", () => {
    const at = new Date(2026, 9, 8, 11, 48).getTime();
    expect(formatStartedAt(at)).toMatch(/11:48/);
  });

  it("has no start time without a start", () => {
    expect(formatStartedAt(null)).toBeNull();
  });
});
