import { describe, expect, it } from "vitest";
import {
  defaultServerColor,
  isServerColor,
  parseServerColor,
  serverColor,
  SERVER_COLOR_PALETTE,
} from "./serverColor.ts";

describe("serverColor", () => {
  it("derives a deterministic palette default from the server id", () => {
    const first = defaultServerColor("server-1");
    expect(SERVER_COLOR_PALETTE).toContain(first);
    expect(defaultServerColor("server-1")).toBe(first);
    // Different ids spread across the palette (at least two distinct colors).
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(defaultServerColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("prefers the stored palette color over the hash default", () => {
    expect(serverColor({ id: "server-1", color: SERVER_COLOR_PALETTE[0] })).toBe(
      SERVER_COLOR_PALETTE[0],
    );
  });

  it("falls back to the hash default for missing or invalid colors", () => {
    expect(serverColor({ id: "server-1" })).toBe(defaultServerColor("server-1"));
    expect(serverColor({ id: "server-1", color: "hotpink" })).toBe(
      defaultServerColor("server-1"),
    );
    expect(serverColor({ id: "server-1", color: 42 })).toBe(defaultServerColor("server-1"));
  });

  it("validates palette membership", () => {
    expect(isServerColor(SERVER_COLOR_PALETTE[0])).toBe(true);
    expect(isServerColor("#ffffff")).toBe(false);
    expect(isServerColor(null)).toBe(false);
  });

  it("parses stored colors tolerantly", () => {
    expect(parseServerColor(SERVER_COLOR_PALETTE[1])).toBe(SERVER_COLOR_PALETTE[1]);
    expect(parseServerColor("hotpink")).toBeUndefined();
    expect(parseServerColor(undefined)).toBeUndefined();
  });
});
