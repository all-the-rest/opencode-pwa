import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W14 (toast adoption, empty-list starters, title reset):
 *  - session-action feedback (fork/interrupt/delete/export/import/revert/
 *    command/permission/form) answers with a toast, success and error alike,
 *    instead of an inline alert box;
 *  - ServerDetail and ProjectDetail empty session lists carry a CTA into the
 *    session starter (`/`);
 *  - "Titel zurücksetzen" stays blocked: `session.update` accepts an empty
 *    title (204) but then keeps the stored one, so there is no reset path.
 */

const server = {
  id: "toast-server",
  name: "Toast-Server",
  baseUrl: "http://toast.local",
  username: "",
};

interface CallLog {
  forks: string[];
}

function freshLog(): CallLog {
  return { forks: [] };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

const messagePayload = {
  data: [
    { type: "user", id: "m1", text: "Erste Nachricht", time: { created: 1000 } },
    { type: "assistant", id: "m2", text: "Antwort", time: { created: 2000 } },
  ],
  cursor: { next: null, previous: null },
};

interface MockOptions {
  /** Rows returned by `GET /api/session?` (default: the one forked session). */
  listSessions?: Array<Record<string, unknown>>;
}

async function mockApi(page: Page, log: CallLog, options: MockOptions = {}) {
  const { listSessions = [{ id: "ses-1", title: "Alpha bauen", projectID: "p1" }] } = options;
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
    // Fork answers with a new session id so the success path can navigate.
    const fork = url.match(/\/api\/session\/([^/]+)\/fork$/);
    if (fork !== null && method === "POST") {
      log.forks.push(fork[1] ?? "");
      await json(route, { data: { id: "ses-fork-1", title: "Alpha bauen" } });
      return;
    }
    if (/\/api\/session\/ses-fork-1$/.test(url) && method === "GET") {
      await json(route, { data: { id: "ses-fork-1", agent: "coder" } });
      return;
    }
    if (/\/api\/session\/ses-fork-1\/message/.test(url)) {
      await json(route, messagePayload);
      return;
    }
    if (/\/api\/session\/ses-1\/message/.test(url)) {
      await json(route, messagePayload);
      return;
    }
    if (/\/api\/session\/ses-1$/.test(url) && method === "GET") {
      await json(route, { data: { id: "ses-1", agent: "coder" } });
      return;
    }
    if (url.includes("/api/project")) {
      await json(route, { location: {}, data: [{ id: "p1", canonical: "/repo", name: "Repo" }] });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, { data: listSessions, cursor: { next: null, previous: null } });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

test(
  "successful fork confirms, forkes and raises a success toast",
  { tag: ["@feature", "@feature:session-toasts"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);
    await expect(page.getByRole("heading", { name: "Alpha bauen" })).toBeVisible();

    await page.getByRole("button", { name: "Session forken" }).click();
    await page.getByRole("button", { name: "Forken", exact: true }).click();

    await expect.poll(() => log.forks, { timeout: 10_000 }).toEqual(["ses-1"]);
    // The confirm dialog closes: action feedback never stays in a dialog.
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    // … and the outcome surfaces as a success toast on the new session.
    const toast = page.getByTestId("toast-stack");
    await expect(toast).toContainText("Session geforkt", { timeout: 10_000 });
    await expect(toast.locator("[data-kind='success']")).toHaveCount(1);
    await expect(page).toHaveURL(/\/sessions\/ses-fork-1\?server=toast-server$/);
  },
);

test(
  "empty server session list offers the session starter as CTA",
  { tag: ["@feature", "@feature:empty-list-starter"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog(), { listSessions: [] });
    await page.goto(`/servers/${server.id}`);

    const empty = page.getByTestId("server-sessions-empty");
    await expect(empty).toContainText("Keine Sessions.");
    const cta = page.getByTestId("server-sessions-empty-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");

    await cta.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("session-starter")).toBeVisible();
  },
);

test(
  "empty project session list offers the session starter as CTA",
  { tag: ["@feature", "@feature:empty-list-starter"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog(), { listSessions: [] });
    await page.goto(`/servers/${server.id}/projects/p1`);

    const empty = page.getByTestId("project-sessions-empty");
    await expect(empty).toContainText("Keine Sessions in diesem Projekt.");
    const cta = page.getByTestId("project-sessions-empty-cta");
    await expect(cta).toHaveAttribute("href", "/");

    await cta.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("session-starter")).toBeVisible();
  },
);

test(
  "title reset stays blocked and explains why",
  { tag: ["@feature", "@feature:session-title-reset"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);
    await expect(page.getByRole("heading", { name: "Alpha bauen" })).toBeVisible();

    await page.getByRole("button", { name: "Session umbenennen" }).click();
    await expect(page.getByTestId("session-rename-form")).toBeVisible();

    const reset = page.getByTestId("session-rename-reset");
    await expect(reset).toBeVisible();
    // Blocked: `PATCH /api/session/{id}` keeps the stored title when the body
    // carries an empty one (verified against a live server), so there is no
    // path back to the generated server default.
    await expect(reset).toBeDisabled();
    await expect(reset).toHaveAttribute("title", /behält einen gesetzten Titel/);
  },
);
