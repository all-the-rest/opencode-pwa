import { describe, expect, it } from "vitest";
import { basicAuthHeader, type ServerConfig } from "./opencode.ts";

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "user",
  password: "secret",
};

describe("basicAuthHeader", () => {
  it("encodes user:pass as Basic header", () => {
    expect(basicAuthHeader(server)).toBe(`Basic ${btoa("user:secret")}`);
  });

  it("handles empty credentials", () => {
    expect(basicAuthHeader({ username: "", password: "" })).toBe(`Basic ${btoa(":")}`);
  });
});
