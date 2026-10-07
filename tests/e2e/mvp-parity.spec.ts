import { expect, test, type Page, type Route } from "@playwright/test";

const server = {
  id: "e2e-server",
  name: "E2E-Server",
  baseUrl: "http://e2e.local",
  username: "",
  password: "",
};

const sessionsPage1 = {
  data: [
    { id: "ses-1", title: "Alpha bauen", agent: "coder", projectID: "p1" },
    { id: "ses-2", title: "Beta prüfen", agent: "oracle", projectID: "p2" },
  ],
  cursor: { next: "page2", previous: null },
};

const sessionsPage2 = {
  data: [{ id: "ses-3", title: "Gamma bauen", agent: "coder", projectID: "p1" }],
  cursor: { next: null, previous: null },
};

interface CallLog {
  interrupts: string[];
  deletedSessions: string[];
  deletedShells: string[];
  prompts: Array<{ sessionID: string; text: string }>;
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

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
    if (url.includes("/prompt") && method === "POST") {
      const body = request.postDataJSON() as { text?: unknown };
      const match = url.match(/\/api\/session\/([^/]+)\/prompt/);
      log.prompts.push({
        sessionID: match?.[1] ?? "",
        text: typeof body?.text === "string" ? body.text : "",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "inbox-1" } }),
      });
      return;
    }
    if (url.includes("/interrupt") && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/interrupt/);
      if (match?.[1] !== undefined) log.interrupts.push(match[1]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interrupted: true }),
      });
      return;
    }
    if (method === "DELETE" && /\/api\/session\/[^/]+$/.test(url)) {
      const id = url.split("/api/session/")[1]?.split("?")[0] ?? "";
      log.deletedSessions.push(id);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (method === "DELETE" && /\/api\/shell\/[^/]+$/.test(url)) {
      const id = url.split("/api/shell/")[1]?.split("?")[0] ?? "";
      log.deletedShells.push(id);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.includes("/api/shell/") && url.includes("/output")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          location: {},
          data: { output: "hallo ausgabe\n", cursor: 14, size: 14, truncated: false },
        }),
      });
      return;
    }
    if (url.includes("/api/shell") && method === "GET" && !url.includes("/output")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          location: {},
          data: [{ id: "sh-1", command: "sleep 60", status: "running" }].filter(
            (s) => !log.deletedShells.includes(s.id),
          ),
        }),
      });
      return;
    }
    if (url.includes("/api/session/") && url.includes("/message")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "msg-1", role: "assistant", text: "Hallo vom Agenten" }],
          cursor: {},
        }),
      });
      return;
    }
    if (url.includes("/api/session") && method === "GET") {
      const cursor = new URL(url).searchParams.get("cursor");
      const pagePayload = cursor === "page2" ? sessionsPage2 : sessionsPage1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: pagePayload.data.filter((s) => !log.deletedSessions.includes(s.id)),
          cursor: pagePayload.cursor,
        }),
      });
      return;
    }
    if (url.includes("/api/pty/") && url.includes("/connect-token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          location: {},
          data: { ticket: "ticket-abc", expires_in: 300 },
        }),
      });
      return;
    }
    if (url.includes("/api/pty")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          location: {},
          data: [{ id: "pty-1", title: "Terminal 1" }],
        }),
      });
      return;
    }
    if (url.includes("/api/project")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { id: "p1", name: "Projekt Eins" },
            { id: "p2", name: "Projekt Zwei" },
          ],
        }),
      });
      return;
    }
    if (url.includes("/api/agent")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location: {}, data: [{ id: "coder" }] }),
      });
      return;
    }
    if (url.includes("/api/info")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "9.9.9", pid: 4242 }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

function freshLog(): CallLog {
  return { interrupts: [], deletedSessions: [], deletedShells: [], prompts: [] };
}

test(
  "dashboard badges show live counts",
  { tag: ["@feature", "@feature:mvp-parity"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto("/");

    await expect(page.getByTestId("badge-sessions")).toContainText("2");
    await expect(page.getByTestId("badge-shells")).toContainText("1");
    await expect(page.getByTestId("badge-agents")).toContainText("1");
  },
);

test(
  "sessions paging and agent/project filter",
  { tag: ["@feature", "@feature:mvp-parity"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/servers/${server.id}`);

    // Scoped to the sessions card: the sidebar duplicates session links.
    const sessionsCard = page.getByTestId("sessions-card");
    await expect(sessionsCard.getByRole("link", { name: "Alpha bauen" })).toBeVisible();
    await expect(sessionsCard.getByRole("link", { name: "Beta prüfen" })).toBeVisible();

    await page.getByRole("button", { name: "Weitere Sessions laden" }).click();
    await expect(sessionsCard.getByRole("link", { name: "Gamma bauen" })).toBeVisible();

    await page.getByLabel("Nach Agent filtern").selectOption("coder");
    await expect(sessionsCard.getByRole("link", { name: "Alpha bauen" })).toBeVisible();
    await expect(sessionsCard.getByRole("link", { name: "Gamma bauen" })).toBeVisible();
    await expect(sessionsCard.getByRole("link", { name: "Beta prüfen" })).toHaveCount(0);

    await page.getByLabel("Nach Agent filtern").selectOption("");
    await page.getByLabel("Sessions suchen").fill("beta");
    await expect(sessionsCard.getByRole("link", { name: "Beta prüfen" })).toBeVisible();
    await expect(sessionsCard.getByRole("link", { name: "Alpha bauen" })).toHaveCount(0);
  },
);

test(
  "session interrupt and delete with confirm (mocked)",
  { tag: ["@feature", "@feature:mvp-parity"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}`);

    // Scoped to the sessions card: the sidebar duplicates session links.
    const sessionsCard = page.getByTestId("sessions-card");
    await expect(sessionsCard.getByRole("link", { name: "Alpha bauen" })).toBeVisible();

    await page.getByRole("button", { name: "Session Alpha bauen unterbrechen" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Ausführung unterbrechen");
    await dialog.getByRole("button", { name: "Unterbrechen", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect
      .poll(() => Promise.resolve(log.interrupts), { timeout: 5000 })
      .toContain("ses-1");

    await page.getByRole("button", { name: "Session Beta prüfen löschen" }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog).toContainText("endgültig gelöscht");
    await deleteDialog.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect
      .poll(() => Promise.resolve(log.deletedSessions), { timeout: 5000 })
      .toContain("ses-2");
    await expect(sessionsCard.getByRole("link", { name: "Beta prüfen" })).toHaveCount(0);
  },
);

test(
  "shell output and remove with confirm (mocked)",
  { tag: ["@feature", "@feature:mvp-parity"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}`);

    await expect(page.getByText("sleep 60")).toBeVisible();

    await page.getByRole("button", { name: "Ausgabe von sleep 60 anzeigen" }).click();
    await expect(page.getByTestId("shell-output-sh-1")).toContainText("hallo ausgabe");

    await page.getByRole("button", { name: "Shell sleep 60 entfernen" }).click();
    const removeDialog = page.getByRole("alertdialog");
    await expect(removeDialog).toContainText("abgebrochen und entfernt");
    await removeDialog.getByRole("button", { name: "Entfernen", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect
      .poll(() => Promise.resolve(log.deletedShells), { timeout: 5000 })
      .toContain("sh-1");
    await expect(page.getByText("sleep 60")).toHaveCount(0);
  },
);

test(
  "prompt send posts to API and clears the box (mocked)",
  { tag: ["@feature", "@feature:mvp-parity"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("message-item").first()).toContainText("Hallo vom Agenten");

    const box = page.getByLabel("Nachricht schreiben");
    await expect(box).toBeEnabled();
    await box.fill("Bitte baue das Feature");
    await page.getByRole("button", { name: "Nachricht senden" }).click();

    await expect
      .poll(() => Promise.resolve(log.prompts.map((p) => p.text)), { timeout: 5000 })
      .toContain("Bitte baue das Feature");
    await expect(box).toHaveValue("");
  },
);

test(
  "github link is visible in header and footer",
  { tag: ["@feature", "@feature:mvp-parity"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto("/");

    await expect(page.getByRole("link", { name: "GitHub-Repository öffnen" })).toHaveAttribute(
      "href",
      "https://github.com/all-the-rest/opencode-pwa",
    );
    await expect(
      page.getByRole("link", { name: "GitHub-Repository", exact: true }),
    ).toHaveAttribute("href", "https://github.com/all-the-rest/opencode-pwa");
  },
);
