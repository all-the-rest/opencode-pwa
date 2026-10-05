// UI-review route manifest — single source of truth for the screenshot set.
// The generic spec (ui-screenshots.spec.ts) picks changes up automatically.
export type UiReviewState = "filled" | "empty";
export type UiReviewViewport = "desktop" | "mobile";

export type UiReviewMock = "none" | "dashboard" | "server" | "session" | "session-empty";

export interface UiReviewRoute {
  name: string;
  path: string;
  states: UiReviewState[];
  mock: UiReviewMock;
  /** Seed one demo server into localStorage before load (empty states skip it). */
  seedServer: boolean;
}

export const SCREENSHOT_OUTPUT_DIR = "test-results/ui-screenshots";
export const EXPECTED_TITLE = "Web PWA for Opencode";

export const routes: UiReviewRoute[] = [
  { name: "dashboard", path: "/", states: ["filled", "empty"], mock: "dashboard", seedServer: true },
  { name: "server-detail", path: "/servers/e2e-server", states: ["filled", "empty"], mock: "server", seedServer: true },
  { name: "session-detail", path: "/sessions/ses-1?server=e2e-server", states: ["filled", "empty"], mock: "session", seedServer: true },
  { name: "settings", path: "/settings", states: ["filled", "empty"], mock: "none", seedServer: true },
];
