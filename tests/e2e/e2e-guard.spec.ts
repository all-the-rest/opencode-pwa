import { expect, test } from "@playwright/test";

/**
 * Project-specific health check for the E2E dev server.
 *
 * Port 5173 is occupied by another project's dev server on this host, and
 * Playwright's `reuseExistingServer` silently reuses whatever answers on the
 * port — so the suite would run against the wrong app and fail confusingly.
 * This guard fetches the served page and fails fast unless it carries this
 * project's marker (`Web PWA for Opencode`, from `index.html`). It runs
 * first via `dependencies` in `playwright.config.ts`: when it fails, no
 * other project runs.
 *
 * `E2E_PORT` keeps working: the check uses the same `baseURL` as every
 * other spec, so a foreign port just needs `E2E_PORT=<free-port> pnpm
 * test:e2e`.
 */
test("e2e dev server is this project's app", async ({ request, baseURL }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(
    body.includes("Web PWA for Opencode"),
    `E2E guard: the server at ${baseURL} is NOT this project's dev server ` +
      `(marker "Web PWA for Opencode" missing — likely a foreign dev server ` +
      `on the shared port). Refusing to run against the wrong app. ` +
      `Use E2E_PORT=<free-port> pnpm test:e2e to start an isolated server.`,
  ).toBe(true);
});
