import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W13 (session title hygiene + rename, adoption Prio 1):
 *  - generated placeholders ("New session - <ISO>", "Child session - …")
 *    never surface: lists, tabs and the header fall back to the session id;
 *  - the header never shows the bare "Session" placeholder when an id exists;
 *  - rename is optimistic with rollback + error toast (PATCH verified);
 *  - `session.renamed` events retitle the open tab live.
 */

const server = {
  id: "titles-server",
  name: "Titles-Server",
  baseUrl: "http://titles.local",
  username: "",
};

interface TitleLog {
  renames: Array<{ sessionID: string; title: string }>;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

interface TitleMockOptions {
  /** Title of ses-t1 in the session list (default: a real title). */
  listTitle?: string | null;
  /** Include ses-t1 in the session list at all (default: yes). */
  listSession?: boolean;
  /** Event payload for /api/event (default: idle heartbeat). */
  eventBody?: string;
  /** PATCH /api/session/ses-t1 status (default: 204). */
  renameStatus?: number;
}

async function mockApi(page: Page, log: TitleLog, options: TitleMockOptions = {}) {
  const {
    listTitle = "Alter Titel",
    listSession = true,
    eventBody = `data: {"type":"session.idle"}\n\n`,
    renameStatus = 204,
  } = options;
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: eventBody,
      });
      return;
    }
    if (/\/api\/session\/ses-t1$/.test(url) && method === "PATCH") {
      const body = (route.request().postDataJSON() ?? {}) as { title?: unknown };
      log.renames.push({
        sessionID: "ses-t1",
        title: typeof body.title === "string" ? body.title : "",
      });
      await route.fulfill({ status: renameStatus, body: "" });
      return;
    }
    if (/\/api\/session\/ses-t1\/message/.test(url)) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }
    if (/\/api\/session\/ses-t1$/.test(url) && method === "GET") {
      await json(route, { data: { id: "ses-t1", agent: "coder" } });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, {
        data:
          listSession && listTitle !== null
            ? [{ id: "ses-t1", title: listTitle, projectKey: null }]
            : [],
        cursor: { next: null, previous: null },
      });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

test(
  "generated session titles fall back to the id everywhere",
  { tag: ["@feature", "@feature:session-titles"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, { renames: [] }, { listTitle: "New session - 2026-10-08T12:00:00.000Z" });

    await page.goto(`/servers/${server.id}`);
    const row = page.getByTestId("session-row-ses-t1");
    await expect(row).toBeVisible();
    await expect(row).toContainText("ses-t1");
    await expect(row).not.toContainText("New session");

    await page.goto(`/sessions/ses-t1?server=${server.id}`);
    await expect(page.getByRole("heading", { name: "ses-t1", exact: true })).toBeVisible();
  },
);

test(
  "rename updates the header optimistically and patches the server",
  { tag: ["@feature", "@feature:session-titles"] },
  async ({ page }) => {
    const log: TitleLog = { renames: [] };
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-t1?server=${server.id}`);
    await expect(page.getByRole("heading", { name: "Alter Titel" })).toBeVisible();

    await page.getByRole("button", { name: "Session umbenennen" }).click();
    await expect(page.getByTestId("session-rename-form")).toBeVisible();
    await page.getByTestId("session-rename-input").fill("Neuer Titel");
    await page.getByTestId("session-rename-save").click();

    await expect.poll(() => log.renames, { timeout: 10_000 }).toContainEqual({
      sessionID: "ses-t1",
      title: "Neuer Titel",
    });
    await expect(page.getByRole("heading", { name: "Neuer Titel" })).toBeVisible();
    await expect(page.getByTestId("session-rename-form")).toHaveCount(0);
  },
);

test(
  "failed rename rolls back and raises an error toast",
  { tag: ["@feature", "@feature:session-titles"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, { renames: [] }, { renameStatus: 500 });
    await page.goto(`/sessions/ses-t1?server=${server.id}`);
    await expect(page.getByRole("heading", { name: "Alter Titel" })).toBeVisible();

    await page.getByRole("button", { name: "Session umbenennen" }).click();
    await page.getByTestId("session-rename-input").fill("Verlorener Titel");
    await page.getByTestId("session-rename-save").click();

    // Optimistic title rolls back to the previous one …
    await expect(page.getByRole("heading", { name: "Alter Titel" })).toBeVisible({
      timeout: 10_000,
    });
    // … and a toast explains the failure (no blocking dialog).
    const toast = page.getByTestId("toast-stack");
    await expect(toast).toContainText("Umbenennen fehlgeschlagen", { timeout: 10_000 });
  },
);

test(
  "session.renamed events retitle the open session live",
  { tag: ["@feature", "@feature:session-titles"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(
      page,
      { renames: [] },
      {
        listSession: false,
        eventBody: `data: {"type":"session.renamed","data":{"sessionID":"ses-t1","title":"Live-Titel"}}\n\n`,
      },
    );
    await page.goto(`/sessions/ses-t1?server=${server.id}`);
    await expect(page.getByRole("heading", { name: "ses-t1", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live-Titel" })).toBeVisible({
      timeout: 15_000,
    });
  },
);
