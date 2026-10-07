import { expect, test, type Page, type Route } from "@playwright/test";

const serverA = {
  id: "srv-a",
  name: "Server A",
  baseUrl: "http://e2e-a.local",
  username: "",
  color: "#ef4444",
};

const projects = [
  { id: "proj-1", name: "Website" },
  { id: "proj-2", name: "API" },
];

const sessions = [
  { id: "ses-1", title: "Alpha bauen", projectID: "proj-1", agent: "builder" },
  { id: "ses-2", title: "Beta prüfen", projectID: "proj-1", agent: "reviewer" },
  { id: "ses-3", title: "Gamma testen", projectID: "proj-2", agent: "builder" },
];

async function seedServers(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify(value));
  }, [serverA]);
}

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (url.includes("/message")) {
      const match = url.match(/\/api\/session\/([^/]+)\/message/);
      const sessionID = match?.[1] ?? "ses";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "msg-1", role: "assistant", text: `Hallo aus ${sessionID}` }],
          cursor: {},
        }),
      });
      return;
    }
    if (url.includes("/api/session") && method === "GET" && !url.includes("/api/session/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: sessions, cursor: { next: null, previous: null } }),
      });
      return;
    }
    if (url.includes("/api/shell") && method === "GET" && !url.includes("/output")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location: {}, data: [] }),
      });
      return;
    }
    if (url.includes("/api/pty") && !url.includes("/connect-token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location: {}, data: [] }),
      });
      return;
    }
    if (url.includes("/api/project")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: projects }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

test(
  "project page has its own route with search in query params (mocked)",
  { tag: ["@feature", "@feature:navigation-project"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);

    // Direct route: only this project's sessions are listed.
    await page.goto(`/servers/${serverA.id}/projects/proj-1`);
    await expect(page.getByTestId("project-detail")).toBeVisible();
    await expect(page.getByTestId("project-title")).toContainText("Website");
    await expect(page.getByTestId("project-session-row-ses-1")).toBeVisible();
    await expect(page.getByTestId("project-session-row-ses-2")).toBeVisible();
    await expect(page.getByTestId("project-session-row-ses-3")).toHaveCount(0);

    // Filter state lives in the URL: typing search updates `?search=`.
    await page.getByTestId("project-search").fill("alpha");
    await expect(page).toHaveURL(/search=alpha/);
    await expect(page.getByTestId("project-session-row-ses-1")).toBeVisible();
    await expect(page.getByTestId("project-session-row-ses-2")).toHaveCount(0);

    // Deep link with query params restores the filter on reload.
    await page.goto(`/servers/${serverA.id}/projects/proj-1?search=beta`);
    await expect(page.getByTestId("project-search")).toHaveValue("beta");
    await expect(page.getByTestId("project-session-row-ses-2")).toBeVisible();
    await expect(page.getByTestId("project-session-row-ses-1")).toHaveCount(0);

    // Back link returns to the server page.
    await page.getByTestId("project-back").click();
    await expect(page).toHaveURL(`/servers/${serverA.id}`);
  },
);

test(
  "server page links projects to their own pages (mocked)",
  { tag: ["@feature", "@feature:navigation-project"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);
    await page.goto(`/servers/${serverA.id}`);
    await expect(page.getByTestId("projects-card")).toBeVisible();

    await page.getByTestId("project-row-proj-1").getByRole("link").click();
    await expect(page).toHaveURL(`/servers/${serverA.id}/projects/proj-1`);
    await expect(page.getByTestId("project-title")).toContainText("Website");
  },
);

test(
  "home shows the session starter and the tab plus button returns to it (mocked)",
  { tag: ["@feature", "@feature:navigation-starter"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);

    // No tabs open: the starter fallback lists the newest sessions.
    await page.goto("/");
    await expect(page.getByTestId("session-starter")).toBeVisible();
    await expect(page.getByTestId("session-starter-row-ses-1")).toBeVisible();
    await expect(page.getByTestId("session-starter-row-ses-3")).toBeVisible();

    // Opening a session registers its tab …
    await page.getByTestId("session-starter-row-ses-1").getByRole("link").click();
    await expect(page).toHaveURL(`/sessions/ses-1?server=${serverA.id}`);
    await expect(page.getByTestId("session-tab-bar")).toBeVisible();

    // … and the "+" button in the tab bar returns to the starter.
    await page.getByTestId("session-tab-new").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("session-starter")).toBeVisible();
    await expect(page.getByTestId("session-starter-open-tabs")).toBeVisible();
  },
);

test(
  "dashboard shows subagent activity per agent (mocked)",
  { tag: ["@feature", "@feature:navigation-activity"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);
    await page.goto("/");
    const activity = page.getByTestId("subagent-activity");
    await expect(activity).toBeVisible();
    await expect(page.getByTestId("subagent-count-builder")).toContainText("2");
    await expect(page.getByTestId("subagent-count-reviewer")).toContainText("1");
  },
);
