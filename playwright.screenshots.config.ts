// Playwright config for the UI-review screenshot set.
//
// Deliberately SEPARATE from playwright.config.ts: this set only captures
// screenshots and never runs inside the normal E2E suite.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/screenshots",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5183",
    trace: "off",
    video: "off",
  },
  outputDir: "test-results/ui-screenshots",
  webServer: {
    command: "pnpm dev --port 5183 --strictPort",
    url: "http://localhost:5183",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 950 } },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
