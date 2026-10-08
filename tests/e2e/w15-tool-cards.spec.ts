import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W15 (tool cards in original quality):
 *  - tool cards show icon + German label + subtitle, argument chips and a
 *    status (streaming/running/completed/error);
 *  - error calls get a dedicated error variant (distinct styling plus
 *    expandable error detail);
 *  - consecutive read/glob/grep/list calls collapse into ONE expandable
 *    context summary row;
 *  - `todowrite` stays hidden like in the original;
 *  - the real `agent-switched` / `model-switched` discriminators render as
 *    notes, never as "unknown content";
 *  - the chat chrome carries `agent · model · time` and the turn duration.
 */

const server = {
  id: "tools-server",
  name: "Tools-Server",
  baseUrl: "http://tools.local",
  username: "",
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

/** Real V2 `SessionMessageInfo` shapes, incl. the real switch discriminators. */
function messagePayload() {
  const at = (created: number) => ({ created });
  return {
    data: [
      // Assistant first: it carries agent/model (+ turn duration), which the
      // chat chrome then shows for the following messages.
      {
        type: "assistant",
        id: "a0",
        agent: "coder",
        model: { id: "claude-sonnet-4", providerID: "anthropic" },
        content: [{ type: "text", text: "Ich schaue mir die Datei an." }],
        time: { created: 900, completed: 2300 },
      },
      {
        type: "user",
        id: "m1",
        text: "Bitte die Datei lesen",
        files: [{ uri: "file:///src/app.ts", name: "app.ts" }],
        time: at(1000),
      },
      {
        type: "assistant",
        id: "m2",
        agent: "coder",
        model: { id: "claude-sonnet-4", providerID: "anthropic" },
        content: [
          {
            type: "tool",
            id: "t0",
            name: "read",
            state: {
              status: "completed",
              input: { filePath: "/src/app.ts", offset: 10, limit: 40 },
              content: [{ type: "text", text: "const a = 1;" }],
            },
          },
          {
            type: "tool",
            id: "t1",
            name: "grep",
            state: {
              status: "completed",
              input: { pattern: "TODO", include: "*.ts" },
              content: [{ type: "text", text: "2 Treffer" }],
            },
          },
          {
            type: "tool",
            id: "t2",
            name: "glob",
            state: { status: "running", input: { pattern: "**/*.ts", path: "/src" } },
          },
          {
            type: "tool",
            id: "t3",
            name: "list",
            state: { status: "completed", input: { path: "/src" } },
          },
          {
            type: "tool",
            id: "t4",
            name: "edit",
            state: {
              status: "completed",
              input: {
                filePath: "/src/app.ts",
                oldString: "const a = 1;\nconst b = 2;",
                newString: "const a = 1;\nconst b = 3;\nconst c = 4;",
              },
            },
          },
          {
            type: "tool",
            id: "t5",
            name: "read",
            state: {
              status: "error",
              input: { filePath: "/src/fehlt.ts" },
              error: { type: "NotFound", message: "Datei nicht gefunden" },
            },
          },
          {
            type: "tool",
            id: "t6",
            name: "bash",
            state: { status: "running", input: { command: "pnpm test" } },
          },
          {
            type: "tool",
            id: "t7",
            name: "todowrite",
            state: { status: "completed", input: { todos: [] } },
          },
          {
            type: "tool",
            id: "t8",
            name: "banana",
            state: { status: "completed", input: { ripeness: 3 } },
          },
          { type: "text", text: "Fertig." },
        ],
        time: at(2000),
      },
      { type: "agent-switched", id: "n1", agent: "review", time: at(3000) },
      {
        type: "model-switched",
        id: "n2",
        model: { id: "gpt-5", providerID: "openai" },
        time: at(3100),
      },
      {
        type: "location-switched",
        id: "n3",
        location: { directory: "/repo" },
        time: at(3200),
      },
      { type: "idle", id: "n4", outcome: "succeeded", time: at(4000) },
    ],
    cursor: { next: null, previous: null },
  };
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
    if (url.includes("/experimental/session/stats")) {
      await json(route, { data: { sessions: 1, prompts: 2, steps: 3 } });
      return;
    }
    if (/\/api\/session\/ses-15\/message/.test(url)) {
      await json(route, messagePayload());
      return;
    }
    if (/\/api\/session\/ses-15$/.test(url) && method === "GET") {
      await json(route, { data: { id: "ses-15", agent: "coder" } });
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
        data: [{ modelID: "claude-sonnet-4", providerID: "anthropic", name: "Claude" }],
      });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, {
        data: [{ id: "ses-15", title: "Tool-Test", projectKey: null }],
        cursor: { next: null, previous: null },
      });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

async function openSession(page: Page) {
  await seedServer(page);
  await mockApi(page);
  await page.goto(`/sessions/ses-15?server=${server.id}`);
  await expect(page.getByTestId("message-list")).toBeVisible();
}

test(
  "tool cards render icon, label, subtitle, chips and status",
  { tag: ["@feature", "@feature:tool-cards"] },
  async ({ page }) => {
    await openSession(page);

    // Edit card: label + file subtitle + change badges + completed status.
    const edit = page.getByTestId("message-tool-m2-4");
    await expect(edit).toContainText("Bearbeiten");
    await expect(edit).toContainText("/src/app.ts");
    await expect(edit).toContainText("+3");
    await expect(edit).toContainText("−2");
    await expect(edit).toContainText("Fertig");

    // Bash card: shell label + command subtitle, shimmering while running.
    const bash = page.getByTestId("message-tool-m2-6");
    await expect(bash).toContainText("Shell");
    await expect(bash).toContainText("pnpm test");
    await expect(bash).toContainText("Läuft");
    await expect(bash.locator(".tool-title-shimmer")).toBeVisible();

    // Unknown tool: its own name as label, argument chips derived from input.
    const weird = page.getByTestId("message-tool-m2-8");
    await expect(weird).toContainText("banana");
    await expect(weird).toContainText("ripeness=3");

    // Argument chips of a completed read call inside the context group.
    await page.getByTestId("message-tool-group-m2-0").locator("summary").click();
    const readRow = page.getByTestId("message-tool-m2-0");
    await expect(readRow).toContainText("Lesen");
    await expect(readRow).toContainText("/src/app.ts");
    await expect(readRow).toContainText("offset=10");
    await expect(readRow).toContainText("limit=40");
    await expect(page.getByTestId("message-tool-m2-1")).toContainText("pattern=TODO");
    await expect(page.getByTestId("message-tool-m2-1")).toContainText("include=*.ts");
  },
);

test(
  "failed tool calls get the error variant with expandable detail",
  { tag: ["@feature", "@feature:tool-cards"] },
  async ({ page }) => {
    await openSession(page);

    const failed = page.getByTestId("message-tool-m2-5");
    await expect(failed).toHaveAttribute("data-status", "error");
    await expect(failed).toHaveClass(/border-error/);
    await expect(failed).toContainText("Fehler");
    // The detail stays collapsed until the card is opened.
    await expect(failed.getByText("Datei nicht gefunden")).toBeHidden();

    await failed.locator("summary").click();
    await expect(failed).toContainText("Datei nicht gefunden");
  },
);

test(
  "consecutive read/glob/grep/list calls collapse into one expandable summary row",
  { tag: ["@feature", "@feature:tool-cards"] },
  async ({ page }) => {
    await openSession(page);

    const group = page.getByTestId("message-tool-group-m2-0");
    await expect(group).toBeVisible();
    // One call inside is still running, so the whole row stays pending.
    await expect(group).toContainText("Wird erkundet");
    await expect(group).toContainText("1 Lesevorgang");
    await expect(group).toContainText("2 Suchen");
    await expect(group).toContainText("1 Liste");
    await expect(group).toContainText("Läuft");

    // The individual calls only exist once the row is expanded.
    await expect(page.getByTestId("message-tool-m2-0")).toBeHidden();
    await group.locator("summary").click();
    await expect(page.getByTestId("message-tool-m2-0")).toBeVisible();
    await expect(page.getByTestId("message-tool-m2-2")).toContainText("Glob");
    await expect(page.getByTestId("message-tool-m2-3")).toContainText("Auflisten");
  },
);

test(
  "todowrite stays hidden in the stream",
  { tag: ["@feature", "@feature:tool-cards"] },
  async ({ page }) => {
    await openSession(page);
    await expect(page.locator('[data-tool="todowrite"]')).toHaveCount(0);
    await expect(page.getByTestId("message-list")).not.toContainText("Aufgaben");
  },
);

test(
  "agent and model switches render as notes, never as unknown content",
  { tag: ["@feature", "@feature:tool-cards"] },
  async ({ page }) => {
    await openSession(page);

    const agentNote = page.getByTestId("message-note-n1");
    await expect(agentNote).toContainText("Agent gewechselt");
    await expect(agentNote).toContainText("review");
    await expect(agentNote).not.toContainText("Unbekannter Inhalt");

    const modelNote = page.getByTestId("message-note-n2");
    await expect(modelNote).toContainText("Modell gewechselt");
    await expect(modelNote).toContainText("openai/gpt-5");
    await expect(modelNote).not.toContainText("Unbekannter Inhalt");

    const locationNote = page.getByTestId("message-note-n3");
    await expect(locationNote).toContainText("Verzeichnis gewechselt");
    await expect(locationNote).toContainText("/repo");
    await expect(locationNote).not.toContainText("Unbekannter Inhalt");

    // No note in this payload degrades to the unknown fallback.
    await expect(page.getByTestId("message-list")).not.toContainText("Unbekannter Inhalt");
  },
);

test(
  "chat chrome shows agent · model · time plus the turn duration",
  { tag: ["@feature", "@feature:tool-cards"] },
  async ({ page }) => {
    await openSession(page);

    const userMeta = page.getByTestId("message-meta-m1");
    await expect(userMeta).toBeVisible();
    await expect(userMeta).toContainText("coder");
    await expect(userMeta).toContainText("anthropic/claude-sonnet-4");

    // The assistant turn took 2300 - 900 = 1400 ms ("1,4 s").
    const assistantHeader = page.locator('li[data-role="assistant"]').first().locator(".chat-header");
    await expect(assistantHeader).toContainText("1,4 s");
    await expect(assistantHeader).toContainText("coder");
  },
);
