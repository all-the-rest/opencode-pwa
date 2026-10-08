import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W12 ("Agenten" overview):
 *  - `/agents` aggregates live executions across all configured servers
 *    (`GET /api/session/active` joined with the session list);
 *  - rows show server dot, agent, model, session title and live status;
 *  - tapping a row opens the session (mobile entry point, tab registers).
 */

const servers = [
  { id: "srv-a", name: "Server A", baseUrl: "http://a.local", username: "" },
  { id: "srv-b", name: "Server B", baseUrl: "http://b.local", username: "" },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServers(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify(value));
  }, servers);
}

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (url.includes("/api/session/active")) {
      if (url.includes("a.local")) {
        await json(route, {
          data: { "ses-a1": { type: "running" }, "ses-a2": { type: "running" } },
        });
      } else {
        await json(route, { data: {} });
      }
      return;
    }
    if (/\/api\/session\/ses-a1\/message/.test(url)) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }
    if (/\/api\/session\/ses-a1$/.test(url) && route.request().method() === "GET") {
      await json(route, {
        data: {
          id: "ses-a1",
          agent: "coder",
          model: { id: "sonnet", providerID: "anthropic" },
        },
      });
      return;
    }
    if (/\/api\/session\/ses-a2$/.test(url) && route.request().method() === "GET") {
      await json(route, {
        data: {
          id: "ses-a2",
          agent: "reviewer",
          model: { id: "opus", providerID: "anthropic" },
        },
      });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      if (url.includes("a.local")) {
        await json(route, {
          data: [
            { id: "ses-a1", title: "Alpha bauen", agent: "coder", projectKey: null },
            { id: "ses-a2", title: "Beta prüfen", agent: "reviewer", projectKey: null },
          ],
          cursor: { next: null, previous: null },
        });
      } else {
        await json(route, { data: [], cursor: { next: null, previous: null } });
      }
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

test(
  "agents overview aggregates running sessions and taps into the session",
  { tag: ["@feature", "@feature:agents-overview"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);
    await page.goto("/agents");

    await expect(page.getByTestId("agents-overview")).toBeVisible();
    const row1 = page.getByTestId("agent-row-srv-a-ses-a1");
    const row2 = page.getByTestId("agent-row-srv-a-ses-a2");
    await expect(row1).toContainText("Alpha bauen");
    await expect(row1).toContainText("coder");
    await expect(row1).toContainText("anthropic/sonnet");
    await expect(row1).toContainText("Läuft");
    await expect(row1).toContainText("Server A");
    await expect(row2).toContainText("Beta prüfen");
    await expect(row2).toContainText("Läuft");

    await row1.click();
    await expect(page).toHaveURL(/\/sessions\/ses-a1\?server=srv-a/, { timeout: 10_000 });
    await expect(page.getByTestId("message-empty-state")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "dashboard activity links to the agents overview",
  { tag: ["@feature", "@feature:agents-overview"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);
    await page.goto("/");
    await page.getByTestId("agents-overview-link").click();
    await expect(page).toHaveURL(/\/agents/, { timeout: 10_000 });
    await expect(page.getByTestId("agents-overview")).toBeVisible({ timeout: 10_000 });
  },
);
