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
    await page.goto(`/servers/${serverA.id}`);
    await page.getByRole("link", { name: "Alpha bauen" }).click();
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
    await page.getByRole("link", { name: "Beta prüfen" }).click();
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

    // Closing the last tab returns to the dashboard.
    await page.getByRole("button", { name: "Tab Alpha bauen schließen" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("session-tab-bar")).toHaveCount(0);
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
