import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W21 (wave 7 — project display name + path tree + folder picker):
 *  - a project renames through PATCH /api/project/{id} — optimistic first,
 *    rollback + error toast on failure (the session rename pattern);
 *  - path-like project names render as an expandable tree (multi-root setup),
 *    not as a flat list;
 *  - a new project is created by browsing the server's directories and
 *    starting a session in the chosen folder (there is no project-create
 *    endpoint — the server derives the project from the session location).
 */

const server = {
  id: "w21-server",
  name: "W21-Server",
  baseUrl: "http://w21.local",
  username: "",
};

interface Project {
  id: string;
  name: string;
  canonical: string;
  icon?: { color?: string };
}

interface Log {
  patches: Array<{ url: string; body: Record<string, unknown> }>;
  creates: Array<{ body: Record<string, unknown> }>;
  sessionID: string;
}

const NESTED_PROJECTS: Project[] = [
  { id: "proj-app", name: "app", canonical: "/srv/app" },
  { id: "proj-api", name: "api", canonical: "/srv/app/services/api" },
  { id: "proj-web", name: "web", canonical: "/home/dev/web" },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

interface MockOptions {
  projects?: Project[];
  /** PATCH /api/project/{id} status (default 200, renames the stored project). */
  patchStatus?: number;
  /** Session id the created-session POST answers with. */
  newSessionID?: string;
}

function mockApi(page: Page, log: Log, options: MockOptions = {}) {
  const {
    projects = NESTED_PROJECTS,
    patchStatus = 200,
    newSessionID = "ses-brandnew",
  } = options;
  // Deep copy: the mock stores renames per test run and must never mutate the
  // shared fixture (parallel workers/tests would otherwise see each other).
  const stored = projects.map((p) => ({ ...p }));
  void page.route("**/api/**", async (route: Route) => {
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

    // Folder picker: `file.list` — path in the query, `{ location, data }` back.
    const fsMatch = url.match(/\/api\/fs\/list\?path=([^&]+)/);
    const requested = fsMatch?.[1] === undefined ? "" : decodeURIComponent(fsMatch[1]);
    const tree: Record<string, Array<{ path: string; type: string }>> = {
      "": [
        { path: "srv", type: "directory" },
        { path: "home", type: "directory" },
        { path: "README.md", type: "file" },
      ],
      "/srv": [
        { path: "app", type: "directory" },
        { path: "notes.txt", type: "file" },
      ],
      "/srv/app": [{ path: "package.json", type: "file" }],
      "/srv/app/services": [{ path: "api", type: "directory" }],
      "/srv/app/services/api": [],
    };
    if (url.includes("/api/fs/list")) {
      await json(route, {
        location: { directory: requested === "" ? "/" : requested },
        data: tree[requested] ?? [],
      });
      return;
    }

    if (url.includes("/api/project") && method === "PATCH") {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      log.patches.push({ url, body });
      const match = url.match(/\/api\/project\/([^/?]+)/);
      const projectID = match?.[1] ?? "";
      const entry = stored.find((p) => p.id === projectID);
      // A failed write changes nothing — a rollback must be observable.
      if (patchStatus < 400 && entry !== undefined) {
        if (typeof body["name"] === "string") entry.name = body["name"];
        const icon = body["icon"];
        if (icon !== null && typeof icon === "object") {
          entry.icon = { color: (icon as { color?: string }).color };
        }
      }
      await json(route, { id: projectID, name: entry?.name ?? projectID }, patchStatus);
      return;
    }

    if (url.includes("/api/project")) {
      await json(route, { data: stored });
      return;
    }

    // New session: the picker's confirm POSTs `{ location: { directory } }`.
    if (url.match(/\/api\/session\/?$/) && method === "POST") {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      log.creates.push({ body });
      log.sessionID = newSessionID;
      await json(route, { data: { id: newSessionID, agent: "coder" } });
      return;
    }

    if (/\/api\/session\/[^/]+\/message/.test(url)) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }
    if (/\/api\/session\/[^/?]+$/.test(url) && method === "GET") {
      await json(route, { data: { id: log.sessionID, agent: "coder" } });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }
    if (url.includes("/api/shell") || url.includes("/api/pty")) {
      await json(route, { location: {}, data: [] });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

function newLog(): Log {
  return { patches: [], creates: [], sessionID: "ses-1" };
}

test(
  "renaming a project is optimistic and patches the server",
  { tag: ["@feature", "@feature:project-rename"] },
  async ({ page }) => {
    const log = newLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}/projects/proj-app`);
    await expect(page.getByTestId("project-title")).toContainText("app");

    await page.getByTestId("project-rename-button").click();
    await expect(page.getByTestId("project-rename-form")).toBeVisible();
    await page.getByTestId("project-rename-input").fill("Mein App");
    await page.getByTestId("project-rename-save").click();

    // The PATCH carries the verified ProjectUpdateInput (projectID rides in
    // the path, so the body is the `{ name }` part) …
    await expect.poll(() => log.patches, { timeout: 10_000 }).toEqual([
      { url: `http://w21.local/api/project/proj-app`, body: { name: "Mein App" } },
    ]);
    // … and the header switched without a reload.
    await expect(page.getByTestId("project-title")).toContainText("Mein App");
    await expect(page.getByTestId("toast-stack")).toContainText("Projekt gespeichert.");
  },
);

test(
  "a failed project rename rolls back and raises an error toast",
  { tag: ["@feature", "@feature:project-rename"] },
  async ({ page }) => {
    const log = newLog();
    await seedServer(page);
    await mockApi(page, log, { patchStatus: 500 });
    await page.goto(`/servers/${server.id}/projects/proj-app`);
    // Exact original label (the shared project is "app" here).
    await expect(page.getByTestId("project-title")).toHaveText("app");

    await page.getByTestId("project-rename-button").click();
    await page.getByTestId("project-rename-input").fill("Verloren");
    await page.getByTestId("project-rename-save").click();

    await expect(page.getByTestId("project-title")).toHaveText("app", { timeout: 10_000 });
    await expect(page.getByTestId("toast-stack")).toContainText("Umbenennen fehlgeschlagen", {
      timeout: 10_000,
    });
  },
);

test(
  "path-like project names render as an expandable tree",
  { tag: ["@feature", "@feature:project-tree"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const log = newLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}`);

    // Three roots/branches: /srv/app (with a nested project) and /home/dev/web.
    await expect(page.getByTestId("project-node-/srv")).toBeVisible();
    await expect(page.getByTestId("project-node-/srv/app")).toBeVisible();
    await expect(page.getByTestId("project-node-/srv/app/services")).toBeVisible();
    await expect(page.getByTestId("project-row-proj-api")).toBeVisible();

    // Collapsing the /srv branch hides its projects; the other root stays.
    await page.getByTestId("project-toggle-/srv").click();
    await expect(page.getByTestId("project-row-proj-api")).toHaveCount(0);
    await expect(page.getByTestId("project-row-proj-app")).toHaveCount(0);
    await expect(page.getByTestId("project-row-proj-web")).toBeVisible();

    // Collapsing only the app node keeps the app row but drops the nested one.
    await page.getByTestId("project-toggle-/srv").click();
    await expect(page.getByTestId("project-row-proj-app")).toBeVisible();
    await page.getByTestId("project-toggle-/srv/app").click();
    await expect(page.getByTestId("project-row-proj-api")).toHaveCount(0);
    await expect(page.getByTestId("project-row-proj-app")).toBeVisible();

    await page.getByTestId("project-toggle-/srv/app").click();
    await expect(page.getByTestId("project-row-proj-api")).toBeVisible();

    // 360px: the tree must not overflow horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  },
);

test(
  "the folder picker browses the server and creates a project session",
  { tag: ["@feature", "@feature:folder-picker"] },
  async ({ page }) => {
    const log = newLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}`);

    await page.getByTestId("new-project-button").click();
    await expect(page.getByTestId("folder-picker")).toBeVisible();

    // The server location loads first.
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/");
    await expect(page.getByTestId("folder-picker-entry-srv")).toBeVisible();
    // Files are shown but not selectable.
    await expect(page.getByTestId("folder-picker-file-README.md")).toBeVisible();

    // Descend: /srv -> /srv/app.
    await page.getByTestId("folder-picker-entry-srv").click();
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/srv");
    await page.getByTestId("folder-picker-entry-app").click();
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/srv/app");

    // One level up again.
    await page.getByTestId("folder-picker-up").click();
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/srv");

    // Back down and confirm: the session carries the chosen directory.
    await page.getByTestId("folder-picker-entry-app").click();
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/srv/app");
    await page.getByTestId("folder-picker-confirm").click();

    await expect.poll(() => log.creates, { timeout: 10_000 }).toEqual([
      { body: { location: { directory: "/srv/app" } } },
    ]);
    // The new session opens in a tab.
    await expect(page).toHaveURL(`/sessions/ses-brandnew?server=${server.id}`);
    await expect(page.getByTestId("session-tab-ses-brandnew")).toBeVisible();
  },
);

test(
  "the dashboard starter opens the folder picker and starts a project session",
  { tag: ["@feature", "@feature:folder-picker"] },
  async ({ page }) => {
    const log = newLog();
    await seedServer(page);
    await mockApi(page, log);
    // "Auch Starter": the folder picker is reachable from the dashboard starter,
    // not only from the server detail page.
    await page.goto(`/`);
    await expect(page.getByTestId("session-starter")).toBeVisible();
    await page.getByTestId("starter-new-project-button").click();
    await expect(page.getByTestId("folder-picker")).toBeVisible();

    // Same behaviour as on the server page: the location loads, then navigate.
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/");
    await expect(page.getByTestId("folder-picker-entry-srv")).toBeVisible();

    await page.getByTestId("folder-picker-entry-srv").click();
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/srv");
    await page.getByTestId("folder-picker-entry-app").click();
    await expect(page.getByTestId("folder-picker-path")).toHaveText("/srv/app");
    await page.getByTestId("folder-picker-confirm").click();

    // Confirm creates the session in the chosen directory …
    await expect.poll(() => log.creates, { timeout: 10_000 }).toEqual([
      { body: { location: { directory: "/srv/app" } } },
    ]);
    // … and opens it in a tab on the selected server.
    await expect(page).toHaveURL(`/sessions/ses-brandnew?server=${server.id}`);
    await expect(page.getByTestId("session-tab-ses-brandnew")).toBeVisible();
  },
);

test(
  "the folder picker reports a load failure without losing the dialog",
  { tag: ["@feature", "@feature:folder-picker"] },
  async ({ page }) => {
    const log = newLog();
    await seedServer(page);
    // Break only the fs listing.
    await mockApi(page, log);
    await page.route("**/api/fs/list**", (route: Route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto(`/servers/${server.id}`);
    await page.getByTestId("new-project-button").click();
    await expect(page.getByTestId("folder-picker-error")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("folder-picker-cancel").click();
    await expect(page.getByTestId("folder-picker")).toHaveCount(0);
  },
);
