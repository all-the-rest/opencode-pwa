// UI-review route manifest — single source of truth for the screenshot set.
// The generic spec (ui-screenshots.spec.ts) picks changes up automatically.
export type UiReviewState = "filled" | "empty";
export type UiReviewViewport = "desktop" | "mobile";

export type UiReviewMock =
  | "none"
  | "dashboard"
  | "server"
  | "session"
  | "session-empty"
  | "chat-steps"
  | "chat-running"
  | "session-diff"
  | "agents"
  | "project"
  | "tools"
  | "agent-detail";

export interface UiReviewRoute {
  name: string;
  path: string;
  states: UiReviewState[];
  mock: UiReviewMock;
  /** Seed one demo server into localStorage before load (empty states skip it). */
  seedServer: boolean;
  /** Testids clicked in order before the capture (opens a tab/dock). */
  steps?: string[];
  /** URL substrings whose requests are aborted (drives the offline state). */
  failUrls?: string[];
}

export const SCREENSHOT_OUTPUT_DIR = "test-results/ui-screenshots";
export const EXPECTED_TITLE = "Web PWA for Opencode";

export const routes: UiReviewRoute[] = [
  { name: "dashboard", path: "/", states: ["filled", "empty"], mock: "dashboard", seedServer: true },
  { name: "server-detail", path: "/servers/e2e-server", states: ["filled", "empty"], mock: "server", seedServer: true },
  { name: "session-detail", path: "/sessions/ses-1?server=e2e-server", states: ["filled", "empty"], mock: "session", seedServer: true },
  { name: "settings", path: "/settings", states: ["filled", "empty"], mock: "none", seedServer: true },
  // All session states, driven by real V2-shaped mocks.
  {
    name: "chat-steps",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled", "empty"],
    mock: "chat-steps",
    seedServer: true,
  },
  {
    name: "chat-running",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled"],
    mock: "chat-running",
    seedServer: true,
  },
  {
    name: "session-diff",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled"],
    mock: "session-diff",
    seedServer: true,
    // The "Mehr…" disclosure lives behind the Experte mode (wave 6).
    steps: ["session-mode-expert", "session-more-toggle", "session-more-tab-diff"],
  },
  {
    name: "session-inbox",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled"],
    mock: "chat-steps",
    seedServer: true,
    steps: ["session-mode-expert", "session-more-toggle", "session-more-tab-inbox"],
  },
  {
    name: "session-forms",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled"],
    mock: "chat-steps",
    seedServer: true,
    steps: ["session-mode-expert", "session-more-toggle", "session-more-tab-forms"],
  },
  {
    name: "session-offline",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled"],
    mock: "chat-steps",
    seedServer: true,
    failUrls: ["/api/session/ses-1/message"],
  },
  // Wave 6: the expert surface of a running session (picker bar + "Mehr…").
  {
    name: "chat-expert",
    path: "/sessions/ses-1?server=e2e-server",
    states: ["filled"],
    mock: "chat-running",
    seedServer: true,
    steps: ["session-mode-expert"],
  },
  { name: "agents", path: "/agents", states: ["filled", "empty"], mock: "agents", seedServer: true },
  {
    name: "project-detail",
    path: "/servers/e2e-server/projects/p1",
    states: ["filled", "empty"],
    mock: "project",
    seedServer: true,
  },
  {
    name: "server-tools",
    path: "/servers/e2e-server/tools",
    states: ["filled", "empty"],
    mock: "tools",
    seedServer: true,
  },
  {
    name: "agent-detail",
    path: "/servers/e2e-server/agents/build",
    states: ["filled"],
    mock: "agent-detail",
    seedServer: true,
  },
];
