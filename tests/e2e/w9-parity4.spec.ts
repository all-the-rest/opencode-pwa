import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W9 (parity batch 4):
 *  - ServerTools: integrations list + per-integration detail with key-based
 *    connect and OAuth begin/status (read-only), config viewer with shells.
 */

const server = {
  id: "parity4-server",
  name: "Parity-Server",
  baseUrl: "http://parity4.local",
  username: "",
};

interface CallLog {
  keyConnects: Array<{ integrationID: string; key: string; label: string | null }>;
  oauthBegins: Array<{ integrationID: string; methodID: string }>;
  oauthStatusPolls: string[];
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

function freshLog(): CallLog {
  return { keyConnects: [], oauthBegins: [], oauthStatusPolls: [] };
}

const integrationList = {
  location: {},
  data: [
    {
      id: "github",
      name: "GitHub",
      methods: [
        { id: "m-oauth", type: "oauth", label: "OAuth" },
        { type: "key", label: "API-Schlüssel" },
      ],
      connections: [{ type: "credential", id: "c1", label: "Arbeit", method: "oauth" }],
    },
  ],
};

const integrationDetail = {
  location: {},
  data: integrationList.data[0],
};

async function mockApi(page: Page, log: CallLog) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }

    const keyMatch = url.match(/\/api\/integration\/([^/]+)\/connect\/key$/) && method === "POST";
    if (keyMatch !== false && keyMatch !== null) {
      const match = url.match(/\/api\/integration\/([^/]+)\/connect\/key/);
      const body = (request.postDataJSON() ?? {}) as { key?: unknown; label?: unknown };
      log.keyConnects.push({
        integrationID: match?.[1] ?? "",
        key: typeof body.key === "string" ? body.key : "",
        label: typeof body.label === "string" ? body.label : null,
      });
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const oauthBegin =
      url.match(/\/api\/integration\/([^/]+)\/connect\/oauth$/) && method === "POST";
    if (oauthBegin !== false && oauthBegin !== null) {
      const match = url.match(/\/api\/integration\/([^/]+)\/connect\/oauth/);
      const body = (request.postDataJSON() ?? {}) as { methodID?: unknown };
      log.oauthBegins.push({
        integrationID: match?.[1] ?? "",
        methodID: typeof body.methodID === "string" ? body.methodID : "",
      });
      await json(route, {
        location: {},
        data: {
          attemptID: "a1",
          url: "https://anbieter.local/auth",
          instructions: "Im Browser anmelden.",
          mode: "auto",
        },
      });
      return;
    }

    const oauthStatus = url.match(/\/api\/integration\/([^/]+)\/connect\/oauth\/([^/]+)$/);
    if (oauthStatus !== null && method === "GET") {
      log.oauthStatusPolls.push(oauthStatus[2] ?? "");
      await json(route, { location: {}, data: { status: "pending" } });
      return;
    }

    if (/\/api\/integration\/[^/]+$/.test(url) && method === "GET") {
      await json(route, integrationDetail);
      return;
    }

    if (url.includes("/api/integration")) {
      await json(route, integrationList);
      return;
    }

    // `/api/config/shell` must come before `/api/config` (prefix overlap).
    if (url.includes("/api/config/shell")) {
      await json(route, [{ path: "/bin/bash", name: "bash", acceptable: true }]);
      return;
    }

    if (url.includes("/api/config")) {
      await json(route, [
        {
          type: "document",
          path: "/repo/opencode.json",
          info: { shell: "/bin/bash", model: "anthropic/claude", default_agent: "coder" },
        },
      ]);
      return;
    }

    if (url.includes("/api/session")) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }

    if (url.includes("/api/project")) {
      await json(route, { location: {}, data: [{ id: "p1", canonical: "/repo", name: "Repo" }] });
      return;
    }

    if (url.includes("/api/agent")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/provider") || url.includes("/api/model")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/command") || url.includes("/api/skill")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/websearch")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/permission/request")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (
      url.includes("/api/fs") ||
      url.includes("/api/vcs") ||
      url.includes("/api/worktree") ||
      url.includes("/api/mcp")
    ) {
      await json(route, { location: {}, data: [] });
      return;
    }

    await json(route, {});
  });
}

test(
  "integrations list opens detail and connects a key",
  { tag: ["@feature", "@feature:integration"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}/tools`);

    await expect(page.getByTestId("integrations-card")).toBeVisible();
    await expect(page.getByTestId("integration-row-github")).toContainText("GitHub");
    await page.getByRole("button", { name: "Details zu Integration GitHub anzeigen" }).click();

    await expect(page.getByTestId("integration-detail")).toContainText("GitHub");
    await expect(page.getByTestId("integration-detail")).toContainText("OAuth");
    await expect(page.getByTestId("integration-connection-0")).toContainText("Arbeit");

    await page.getByTestId("integration-key-input").fill("geheim");
    await page.getByTestId("integration-key-label").fill("Arbeit");
    await page.getByTestId("integration-key-connect").click();

    await expect
      .poll(() => log.keyConnects, { timeout: 10_000 })
      .toContainEqual({ integrationID: "github", key: "geheim", label: "Arbeit" });
    await expect(page.getByText("Schlüssel gespeichert")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "oauth begin shows the provider url and polls status read-only",
  { tag: ["@feature", "@feature:integration-oauth"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}/tools`);

    await page.getByRole("button", { name: "Details zu Integration GitHub anzeigen" }).click();
    await expect(page.getByTestId("integration-detail")).toBeVisible();

    await page.getByTestId("oauth-begin").click();
    await expect
      .poll(() => log.oauthBegins, { timeout: 10_000 })
      .toContainEqual({ integrationID: "github", methodID: "m-oauth" });
    await expect(page.getByTestId("oauth-url")).toContainText("anbieter.local/auth");

    await page.getByTestId("oauth-status-check").click();
    await expect
      .poll(() => log.oauthStatusPolls, { timeout: 10_000 })
      .toContainEqual("a1");
    await expect(page.getByTestId("oauth-status")).toContainText("wartet");
  },
);

test(
  "config viewer shows entries and available shells",
  { tag: ["@feature", "@feature:config"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/servers/${server.id}/tools`);

    await expect(page.getByTestId("config-card")).toBeVisible();
    await expect(page.getByTestId("config-row-0")).toContainText("/repo/opencode.json");
    await expect(page.getByTestId("config-row-0")).toContainText("/bin/bash");
    await expect(page.getByTestId("config-row-0")).toContainText("anthropic/claude");
    await expect(page.getByTestId("config-shell-/bin/bash")).toContainText("geeignet");
  },
);
