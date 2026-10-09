import { expect, test, type Page, type Route } from "@playwright/test";

const serverA = {
  id: "srv-a",
  name: "Server A",
  baseUrl: "http://e2e-a.local",
  username: "",
  color: "#ef4444",
};

const serverB = {
  id: "srv-b",
  name: "Server B",
  baseUrl: "http://e2e-b.local",
  username: "",
  color: "#3b82f6",
};

const sessionsByHost: Record<string, Array<{ id: string; title: string }>> = {
  "e2e-a.local": [{ id: "ses-a1", title: "Alpha bauen" }],
  "e2e-b.local": [{ id: "ses-b1", title: "Beta prüfen" }],
};

async function seedServers(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify(value));
  }, [serverA, serverB]);
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
      const host = new URL(url).hostname;
      const rows = sessionsByHost[host] ?? [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows, cursor: { next: null, previous: null } }),
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
        body: JSON.stringify({ data: [] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

/**
 * Same mock as `mockApi`, but `/api/project` returns the given projects and
 * PATCH calls are recorded. A PATCH updates the stored project name, so a
 * following GET (the page's reload) shows the renamed project.
 */
async function mockApiWithProjects(
  page: Page,
  initialProjects: Array<{ id: string; name: string }>,
  patchCalls: string[],
) {
  const projects = [...initialProjects];
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
      // One session per project: the server page hides projects with zero
      // sessions by default ("leere Projekte" filter), and these tests assert
      // on the project row of the given project.
      const rows = initialProjects.map((project, index) => ({
        id: `ses-${project.id}`,
        title: `Session ${index + 1}`,
        agent: "build",
        projectID: project.id,
        time: { created: Date.now() - (index + 1) * 60_000, updated: Date.now() - 60_000 },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows, cursor: { next: null, previous: null } }),
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
    if (url.includes("/api/project") && method === "PATCH") {
      patchCalls.push(url);
      const body = route.request().postDataJSON() as { name?: string };
      const match = url.match(/\/api\/project\/([^/]+)/);
      const projectID = match?.[1] ?? "";
      const entry = projects.find((p) => p.id === projectID);
      if (entry !== undefined) entry.name = body.name ?? entry.name;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: projectID, name: body.name ?? projectID }),
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
  "server rename inline with German labels (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);
    await page.goto(`/servers/${serverA.id}`);

    await expect(page.getByTestId("server-detail-dot")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Server: Server A" })).toBeVisible();

    await page.getByTestId("server-rename-button").click();
    await expect(page.getByTestId("server-rename-input")).toBeVisible();
    await page.getByTestId("server-rename-input").fill("Server A Neu");
    await page.getByTestId("server-rename-save").click();

    await expect(page.getByRole("heading", { name: "Server: Server A Neu" })).toBeVisible();

    // Rename persists in the stored entry (local-only). Note: no reload
    // assertion — the seed init-script re-applies the original names on every
    // page load by design; the provider roundtrip is unit-tested instead.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("opencode-pwa:servers") as string),
    );
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ id: "srv-a", name: "Server A Neu" });
  },
);

test(
  "server delete with German confirm navigates to overview (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);
    await page.goto(`/servers/${serverB.id}`);

    await page.getByTestId("server-delete-button").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Server löschen");
    await expect(dialog).toContainText("nur die lokal gespeicherten Daten");
    await dialog.getByRole("button", { name: "Entfernen", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
    // Scoped to <main>: the header server picker still lists removed names
    // nowhere, but its <option> elements would match an unscoped query.
    const main = page.locator("main");
    await expect(main.getByText("Server B", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Server A", { exact: true }).first()).toBeVisible();
  },
);

test(
  "session tabs open/close across servers with color dots (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);

    // Open a session on server A: tab registers with the session title.
    // Scoped to the sessions card: the sidebar duplicates session links.
    await page.goto(`/servers/${serverA.id}`);
    await page.getByTestId("sessions-card").getByRole("link", { name: "Alpha bauen" }).click();
    await expect(page).toHaveURL(`/sessions/ses-a1?server=${serverA.id}`);
    const tabBar = page.getByTestId("session-tab-bar");
    await expect(tabBar).toBeVisible();
    await expect(page.getByTestId("session-tab-ses-a1")).toContainText("Alpha bauen");
    await expect(page.getByTestId("session-tab-dot-ses-a1")).toHaveCSS(
      "background-color",
      "rgb(239, 68, 68)",
    );

    // Open a session on server B: both tabs stay side by side.
    await page.goto(`/servers/${serverB.id}`);
    await page.getByTestId("sessions-card").getByRole("link", { name: "Beta prüfen" }).click();
    await expect(page).toHaveURL(`/sessions/ses-b1?server=${serverB.id}`);
    await expect(page.getByTestId("session-tab-ses-a1")).toBeVisible();
    await expect(page.getByTestId("session-tab-ses-b1")).toContainText("Beta prüfen");
    await expect(page.getByTestId("session-tab-dot-ses-b1")).toHaveCSS(
      "background-color",
      "rgb(59, 130, 246)",
    );

    // Tabs persist in localStorage.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("opencode-pwa:session-tabs") as string),
    );
    expect(stored).toHaveLength(2);

    // Switching tabs navigates; closing the active tab returns to the other.
    await page.getByTestId("session-tab-ses-a1").getByRole("link").click();
    await expect(page).toHaveURL(`/sessions/ses-a1?server=${serverA.id}`);
    await page.goto(`/sessions/ses-b1?server=${serverB.id}`);
    await page.getByRole("button", { name: "Tab Beta prüfen schließen" }).click();
    await expect(page).toHaveURL(`/sessions/ses-a1?server=${serverA.id}`);
    await expect(page.getByTestId("session-tab-ses-b1")).toHaveCount(0);

    // Closing the last tab returns to the dashboard. The tab bar itself
    // stays rendered (always visible) with just the "+ Neu" shortcut left.
    await page.getByRole("button", { name: "Tab Alpha bauen schließen" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("session-tab-ses-a1")).toHaveCount(0);
    await expect(page.getByTestId("session-tab-new")).toBeVisible();
  },
);

test(
  "server colors show on dashboard badge and list (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByTestId("dashboard-server-dot")).toHaveCSS(
      "background-color",
      "rgb(239, 68, 68)",
    );
    const main = page.locator("main");
    await expect(main.getByText("Server A", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Server B", { exact: true }).first()).toBeVisible();
  },
);

test(
  "tabs render while the server is offline (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "opencode-pwa:servers",
        JSON.stringify([
          { id: "srv-a", name: "Server A", baseUrl: "http://e2e-a.local", username: "" },
        ]),
      );
      localStorage.setItem(
        "opencode-pwa:session-tabs",
        JSON.stringify([{ serverID: "srv-a", sessionID: "ses-a1", title: "Alpha bauen" }]),
      );
    });
    // Every API call fails: the server is offline.
    await page.route("**/api/**", async (route: Route) => {
      await route.abort("failed");
    });

    await page.goto(`/sessions/ses-a1?server=srv-a`);
    // The cached tab still renders; the session view shows the offline state.
    await expect(page.getByTestId("session-tab-bar")).toBeVisible();
    await expect(page.getByTestId("session-tab-ses-a1")).toContainText("Alpha bauen");
    await expect(page.getByText("offline", { exact: false }).first()).toBeVisible();

    await page.goto(`/servers/srv-a`);
    await expect(page.getByTestId("offline-alert")).toBeVisible();
    await expect(page.getByTestId("session-tab-ses-a1")).toBeVisible();
  },
);

test(
  "direct-URL session mount resolves the real session title (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    await mockApi(page);

    // Direct navigation (no prior openTab): the tab shows the resolved
    // session title, not the raw session id.
    await page.goto(`/sessions/ses-a1?server=${serverA.id}`);
    const tab = page.getByTestId("session-tab-ses-a1");
    await expect(tab).toBeVisible();
    await expect(tab).toContainText("Alpha bauen");
    await expect(tab).not.toContainText("ses-a1");

    // Unknown session id: the id stays the label (fallback).
    await page.goto(`/sessions/ses-unknown?server=${serverA.id}`);
    await expect(page.getByTestId("session-tab-ses-unknown")).toContainText("ses-unknown");
  },
);

test(
  "server rename writes through to a single project after confirm (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    const patchCalls: string[] = [];
    await mockApiWithProjects(page, [{ id: "proj-1", name: "Projekt Eins" }], patchCalls);
    await page.goto(`/servers/${serverA.id}`);

    await page.getByTestId("server-rename-button").click();
    await page.getByTestId("server-rename-input").fill("Server A Neu");
    await page.getByTestId("server-rename-save").click();

    // Exactly one project: the write-through confirm appears.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("genau ein Projekt");
    await dialog.getByRole("button", { name: "Umbenennen", exact: true }).click();

    // The PATCH went out, the dialog closed, and both names updated.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(patchCalls.some((url) => url.includes("/api/project/proj-1"))).toBe(true);
    await expect(page.getByRole("heading", { name: "Server: Server A Neu" })).toBeVisible();
    const projectsCard = page.locator("section.card", {
      has: page.getByRole("heading", { name: "Projekte" }),
    });
    await expect(projectsCard).toContainText("Server A Neu");
  },
);

test(
  "server rename stays local-only with multiple projects (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await seedServers(page);
    const patchCalls: string[] = [];
    await mockApiWithProjects(
      page,
      [
        { id: "proj-1", name: "Projekt Eins" },
        { id: "proj-2", name: "Projekt Zwei" },
      ],
      patchCalls,
    );
    await page.goto(`/servers/${serverA.id}`);

    await page.getByTestId("server-rename-button").click();
    await page.getByTestId("server-rename-input").fill("Server A Neu");
    await page.getByTestId("server-rename-save").click();

    // No unambiguous project mapping: no confirm dialog, no PATCH.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Server: Server A Neu" })).toBeVisible();
    expect(patchCalls).toHaveLength(0);
  },
);

test(
  "session tab bar scrolls horizontally without page overflow (mocked)",
  { tag: ["@feature", "@feature:server-tabs"] },
  async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "opencode-pwa:servers",
        JSON.stringify([
          { id: "srv-a", name: "Server A", baseUrl: "http://e2e-a.local", username: "" },
        ]),
      );
      localStorage.setItem(
        "opencode-pwa:session-tabs",
        JSON.stringify([
          { serverID: "srv-a", sessionID: "ses-a1", title: "Alpha bauen mit langem Sitzungstitel eins" },
          { serverID: "srv-a", sessionID: "ses-a2", title: "Beta prüfen mit langem Sitzungstitel zwei" },
          { serverID: "srv-a", sessionID: "ses-a3", title: "Gamma testen mit langem Sitzungstitel drei" },
          { serverID: "srv-a", sessionID: "ses-a4", title: "Delta deployen mit langem Sitzungstitel vier" },
          { serverID: "srv-a", sessionID: "ses-a5", title: "Epsilon reviewen mit langem Sitzungstitel fünf" },
          { serverID: "srv-a", sessionID: "ses-a6", title: "Zeta dokumentieren mit langem Sitzungstitel sechs" },
        ]),
      );
    });
    await mockApi(page);
    await page.goto(`/sessions/ses-a1?server=srv-a`);

    const tabBar = page.getByTestId("session-tab-bar");
    await expect(tabBar).toBeVisible();
    // The page itself never overflows horizontally: the tab bar scrolls internally.
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
    // The scrollable container is the <nav> (the testid sits on the <ul>).
    // It scrolls horizontally and the last tab is reachable by scrolling.
    // (The session page auto-scrolls to the bottom on mount, so the page
    // itself is brought back to the top before the viewport assertion.)
    const tabBarNav = page.getByRole("navigation", { name: "Offene Sessions" });
    const scrolls = await tabBarNav.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
    await tabBarNav.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("session-tab-ses-a6")).toBeInViewport();
  },
);
