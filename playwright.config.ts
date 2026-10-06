import { defineConfig, devices } from "@playwright/test";

// E2E_PORT overrides the dev-server port (default 5173). Used when the
// default port is occupied by another project's dev server.
const e2ePort = Number(process.env["E2E_PORT"] ?? 5173);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env["CI"] ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${e2ePort}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm dev --port ${e2ePort} --strictPort`,
    url: `http://localhost:${e2ePort}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
  projects: [
    // Health check first: fails fast when `reuseExistingServer` above picks
    // up a foreign dev server on the shared port (see e2e-guard.spec.ts).
    // Every other project depends on it, so nothing runs against the wrong
    // app.
    {
      name: "e2e-guard",
      testMatch: /e2e-guard\.spec\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["e2e-guard"],
      testIgnore: /e2e-guard\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      dependencies: ["e2e-guard"],
      testIgnore: /e2e-guard\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
