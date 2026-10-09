import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W7 (parity batch 2):
 *  - SessionDetail: per-session stats card (tokens/cost from `session.get`,
 *    tool totals from the global `/api/experimental/session/stats`), session
 *    diff view (`GET /api/session/{id}/diff`), fork + compact with German
 *    confirm, workspace file attachments in the prompt box.
 *  - ServerTools: agent list with detail links, read-only provider + model
 *    overview. AgentDetail shows capabilities + model.
 */

const server = {
  id: "parity2-server",
  name: "Parity-Server",
  baseUrl: "http://parity2.local",
  username: "",
};

interface PromptCall {
  sessionID: string;
  text: string;
  files: Array<Record<string, unknown>>;
}

interface CallLog {
  prompts: PromptCall[];
  forks: string[];
  compacts: string[];
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
    // Wave 6: the "Mehr…" panels live behind the Experte mode (default is
    // Einfach), so this spec seeds it — the panels stay under test.
    localStorage.setItem("opencode-pwa:session-mode", "expert");
  }, server);
}

function freshLog(): CallLog {
  return { prompts: [], forks: [], compacts: [] };
}

const sessionInfo = {
  data: {
    id: "ses-1",
    agent: "coder",
    model: { id: "claude-sonnet-4", providerID: "anthropic" },
    tokens: { input: 12345, output: 678, reasoning: 90, cache: { read: 11, write: 22 } },
    cost: 0.05,
  },
};

const sessionInfoForked = {
  data: {
    id: "ses-2",
    agent: "coder",
    model: { id: "claude-sonnet-4", providerID: "anthropic" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
  },
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

    if (url.includes("/experimental/session/stats")) {
      await json(route, {
        data: {
          sessions: 3,
          prompts: 11,
          steps: 27,
          tokens: { input: 5000, output: 2000, reasoning: 0, cache: { read: 100, write: 50 } },
          cost: 0.42,
          tools: { mode: "summary", totals: { calls: 14, succeeded: 13, failed: 1, unfinished: 0 } },
        },
      });
      return;
    }

    const promptMatch = url.match(/\/api\/session\/([^/]+)\/prompt$/) && method === "POST";
    if (promptMatch !== false && promptMatch !== null) {
      const match = url.match(/\/api\/session\/([^/]+)\/prompt/);
      const body = (request.postDataJSON() ?? {}) as { text?: unknown; files?: unknown };
      log.prompts.push({
        sessionID: match?.[1] ?? "",
        text: typeof body.text === "string" ? body.text : "",
        files: Array.isArray(body.files) ? (body.files as PromptCall["files"]) : [],
      });
      await json(route, { id: "inbox-1" });
      return;
    }

    if (/\/api\/session\/[^/]+\/fork$/.test(url) && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/fork/);
      log.forks.push(match?.[1] ?? "");
      await json(route, sessionInfoForked);
      return;
    }

    if (/\/api\/session\/[^/]+\/compact$/.test(url) && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/compact/);
      log.compacts.push(match?.[1] ?? "");
      await json(route, { id: "inbox-compact" });
      return;
    }

    if (url.includes("/api/session/ses-1/diff") || url.includes("/api/session/ses-2/diff")) {
      await json(route, {
        data: [
          {
            file: "src/app.ts",
            patch: "@@ -1,2 +1,3 @@\n+neu",
            additions: 12,
            deletions: 3,
            status: "modified",
          },
          { file: "src/neu.ts", patch: "+++ neu", additions: 40, deletions: 0, status: "added" },
        ],
      });
      return;
    }

    if (url.includes("/api/session/ses-1/message") || url.includes("/api/session/ses-2/message")) {
      const empty = url.includes("ses-2");
      await json(route, {
        data: empty
          ? []
          : [
              { id: "m1", role: "user", text: "Hallo" },
              { id: "m2", role: "assistant", text: "Hi!" },
            ],
      });
      return;
    }

    if (url.includes("/api/session/ses-2") && method === "GET") {
      await json(route, sessionInfoForked);
      return;
    }

    if (url.match(/\/api\/session\/ses-1$/) && method === "GET") {
      await json(route, sessionInfo);
      return;
    }

    if (url.match(/\/api\/agent\/coder$/)) {
      await json(route, {
        location: {},
        data: {
          id: "coder",
          name: "Coder",
          description: "Schreibt Code",
          mode: "primary",
          model: { id: "claude-sonnet-4", providerID: "anthropic" },
        },
      });
      return;
    }

    if (url.includes("/api/agent")) {
      await json(route, {
        location: {},
        data: [{ id: "coder", name: "Coder", mode: "primary" }],
      });
      return;
    }

    if (url.includes("/api/model")) {
      await json(route, {
        location: {},
        data: [
          {
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            name: "Claude Sonnet 4",
            capabilities: { tools: true, input: ["text"], output: ["text"] },
          },
        ],
      });
      return;
    }

    if (url.includes("/api/provider")) {
      await json(route, {
        location: {},
        data: [{ id: "anthropic", name: "Anthropic", activation: "enabled" }],
      });
      return;
    }

    if (url.includes("/api/fs/list")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/vcs/status")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/worktree")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/mcp")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/permission/request")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/project")) {
      await json(route, { location: {}, data: [{ id: "p1", canonical: "/repo", name: "Repo" }] });
      return;
    }

    if (url.includes("/api/session")) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }

    await json(route, {});
  });
}

test(
  "session stats card shows per-session tokens, cost and global tool totals",
  { tag: ["@feature", "@feature:session-stats"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("session-more-toggle")).toBeVisible();
    await page.getByTestId("session-more-toggle").click();
    await page.getByTestId("session-more-tab-stats").click();
    await expect(page.getByTestId("session-stats")).toBeVisible();
    await expect(page.getByTestId("session-stats-input")).toContainText("12.345");
    await expect(page.getByTestId("session-stats-output")).toContainText("678");
    await expect(page.getByTestId("session-stats-cost")).toContainText("0,05");
    await expect(page.getByTestId("session-stats")).toContainText("14 Werkzeugaufrufe");
  },
);

test(
  "session diff view lists file diffs in a collapsible section",
  { tag: ["@feature", "@feature:session-diff"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByTestId("session-more-toggle").click();
    await page.getByTestId("session-more-tab-diff").click();
    await expect(page.getByTestId("session-diff-src/app.ts")).toContainText("+12 −3");
    await expect(page.getByTestId("session-diff-src/neu.ts")).toBeVisible();
    await page.getByTestId("session-diff-src/app.ts").locator("summary").click();
    await expect(page.getByTestId("session-diff-src/app.ts")).toContainText("@@ -1,2 +1,3 @@");
  },
);

test(
  "forking a session asks for German confirm and opens the new session",
  { tag: ["@feature", "@feature:session-fork"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByRole("button", { name: "Session forken" }).click();
    await expect(page.getByText("ab dem aktuellen Stand kopiert")).toBeVisible();
    await page.getByRole("button", { name: "Forken", exact: true }).click();

    await expect
      .poll(() => log.forks, { timeout: 10_000 })
      .toContainEqual("ses-1");
    await expect(page).toHaveURL(/\/sessions\/ses-2\?server=/, { timeout: 10_000 });
  },
);

test(
  "compacting a session asks for German confirm and reports the start",
  { tag: ["@feature", "@feature:session-compact"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByRole("button", { name: "Session kompaktieren" }).click();
    await expect(page.getByText("zusammengefasst, um Platz zu schaffen")).toBeVisible();
    await page.getByRole("button", { name: "Kompaktieren", exact: true }).click();

    await expect
      .poll(() => log.compacts, { timeout: 10_000 })
      .toContainEqual("ses-1");
    await expect(page.getByText("Kompaktierung gestartet")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "workspace files can be attached to the prompt box",
  { tag: ["@feature", "@feature:prompt-attachments"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByTestId("prompt-attachment-input").fill("src/app.ts");
    await page.getByRole("button", { name: "Datei anhängen" }).click();
    await expect(page.getByTestId("prompt-attachment-src/app.ts")).toBeVisible();

    await page.getByLabel("Nachricht schreiben").fill("Erkläre diese Datei");
    await page.getByRole("button", { name: "Nachricht senden" }).click();

    await expect
      .poll(() => log.prompts, { timeout: 10_000 })
      .toContainEqual({
        sessionID: "ses-1",
        text: "Erkläre diese Datei",
        // Wave 3: the encoded V2 `PromptFileAttachment` shape — a workspace
        // path travels as a `file://…` uri source.
        files: [{ data: "", mime: "", source: { type: "uri", uri: "file:///src/app.ts" }, name: "app.ts" }],
      });
  },
);

test(
  "agents link to a detail view, providers show their models",
  { tag: ["@feature", "@feature:agent-provider"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/servers/${server.id}/tools`);

    await expect(page.getByTestId("agent-row-coder")).toContainText("Coder");
    await expect(page.getByTestId("provider-row-anthropic")).toContainText("Anthropic");
    await expect(page.getByTestId("provider-row-anthropic")).toContainText("aktiviert");
    await expect(page.getByTestId("provider-row-anthropic")).toContainText("Claude Sonnet 4");

    await page.getByRole("link", { name: "Details zu Agent Coder anzeigen" }).click();
    await expect(page.getByTestId("agent-detail")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent: Coder" })).toBeVisible();
    await expect(page.getByTestId("agent-model")).toContainText("anthropic/claude-sonnet-4");
    await expect(page.getByTestId("agent-capabilities")).toContainText("Ja");
  },
);
