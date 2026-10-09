import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * WAVE 4 (rendered diff surface):
 *  - unified patch rows with line numbers and a +/- gutter instead of a raw
 *    `<pre>` patch dump;
 *  - a per-file header (directory/file-name split) with additions/deletions
 *    and a session-level summary (files, totals);
 *  - the unified/split segmented control of the original's `review-panel-v2`;
 *  - "show more context" expansion for long hunks;
 *  - dedicated empty cards: "Keine Änderungen" and "Kein Git-Repository"
 *    (the latter with the init action);
 *  - at 360px the diff rows stay horizontally scrollable without overlapping
 *    the composer or the jump button.
 */

const server = {
  id: "diff-server",
  name: "Diff-Server",
  baseUrl: "http://diff.local",
  username: "",
};

const SESSION = "ses-1";

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

/** Six context lines, a replaced pair, six context lines: collapses to expanders. */
const MAIN_PATCH = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1234567..89abcde 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,15 +1,17 @@ import { A } from \"a\"",
  " import { A } from \"a\"",
  " import { B } from \"b\"",
  " import { C } from \"c\"",
  " import { D } from \"d\"",
  " import { E as Epsilon, F as Zeta, G as Eta, H as Theta } from \"./very/long/path/to/a/module\"",
  " import { F } from \"f\"",
  "-const alt = 1",
  "-const auchWeg = 2",
  "+const neu = 3",
  "+const auchNeu = 4",
  " ",
  " kontext",
  " weitere",
  " zeilen",
  " noch",
  " mehr",
  " ende",
  "@@ -40,6 +42,4 @@ export function main()",
  " export function main() {",
  "-  return 1",
  "+  return 2",
  " }",
].join("\n");

const README_PATCH = [
  "diff --git a/README.md b/README.md",
  "index 1111111..2222222 100644",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1,2 +1,3 @@",
  " # Titel",
  "+Neue Zeile",
  "\\ No newline at end of file",
].join("\n");

const RENAME_PATCH = [
  "diff --git a/alt/alt.ts b/alt/umbenannt.ts",
  "similarity index 96%",
  "rename from alt/alt.ts",
  "rename to alt/umbenannt.ts",
  "--- a/alt/alt.ts",
  "+++ b/alt/umbenannt.ts",
  "@@ -1 +1 @@",
  "-alt",
  "+neu",
].join("\n");

const BINARY_PATCH = [
  "diff --git a/logo.png b/logo.png",
  "index 3333333..4444444 100644",
  "Binary files a/logo.png and b/logo.png differ",
].join("\n");

function diffRows() {
  return [
    { file: "src/app.ts", patch: MAIN_PATCH, additions: 4, deletions: 3, status: "modified" },
    { file: "README.md", patch: README_PATCH, additions: 1, deletions: 0, status: "modified" },
    { file: "alt/umbenannt.ts", patch: RENAME_PATCH, additions: 1, deletions: 1, status: "added" },
    { file: "logo.png", patch: BINARY_PATCH, additions: 0, deletions: 0, status: "modified" },
  ];
}

/** Project payload with the vcs marker (null = omit `vcs`). */
function projects(vcs: string | null) {
  return [
    vcs === null
      ? { id: "p1", canonical: "/repo/a" }
      : { id: "p1", canonical: "/repo/a", vcs },
  ];
}

/** First diff row of the fixture — the one that starts expanded now. */
const FIRST_DIFF_FILE = "src/app.ts";

async function openDiff(page: Page, openFile?: string) {
  await page.getByTestId("session-more-toggle").click();
  await page.getByTestId("session-more-tab-diff").click();
  await expect(page.getByTestId("session-diff-section")).toBeVisible();
  // The per-file rows live behind a `<details>` (unchanged navigation), so the
  // rendered-line assertions need one open file.
  // The first file now starts expanded (the rendered diff is the default
  // view), so only a NON-first file still needs an explicit click —
  // clicking the first one would collapse it again.
  if (openFile !== undefined && openFile !== FIRST_DIFF_FILE) {
    await page.getByTestId(`session-diff-${openFile}`).locator("summary").click();
  }
}

async function mockApi(
  page: Page,
  options: { rows?: ReturnType<typeof diffRows>; vcs?: string | null } = {},
) {
  const rows = options.rows ?? diffRows();
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }

    if (url.includes(`/api/session/${SESSION}/diff`)) {
      await json(route, { data: rows });
      return;
    }

    if (url.includes("/api/project")) {
      await json(route, { data: projects(options.vcs ?? "git") });
      return;
    }

    if (url.includes(`/api/session/${SESSION}/message`)) {
      await json(route, { data: [{ id: "m1", role: "user", text: "Hallo", time: { created: 1000 } }] });
      return;
    }

    if (url.match(new RegExp(`/api/session/${SESSION}$`))) {
      await json(route, {
        data: {
          id: SESSION,
          agent: "coder",
          model: { id: "claude-sonnet-4", providerID: "anthropic" },
          tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0,
        },
      });
      return;
    }

    if (url.match(/\/api\/session$/)) {
      await json(route, { data: [{ id: SESSION, title: "Diff-Session", projectID: "p1" }] });
      return;
    }

    if (url.includes("/api/agent")) {
      await json(route, { data: [{ id: "coder", name: "Coder", mode: "primary" }] });
      return;
    }

    await json(route, {});
  });
}

test.describe("rendered session diff", () => {
  test.beforeEach(async ({ page }) => {
    await seedServer(page);
  });

  test(
    "renders line rows with numbers and a +/- gutter instead of a raw patch",
    { tag: ["@feature", "@feature:session-diff-render"] },
    async ({ page }) => {
      await mockApi(page);
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page, "src/app.ts");

      const hunk = page.getByTestId("session-diff-hunk-src/app.ts-0");
      await expect(hunk).toContainText("@@ -1,15 +1,17 @@");

      // Additions keep the new line number and a "+" gutter.
      const addRow = hunk.locator('[data-line-kind="add"]').first();
      await expect(addRow.locator("span").nth(1)).toHaveText("7");
      await expect(addRow.locator("span").nth(2)).toHaveText("+");
      await expect(addRow.locator("span").nth(3)).toHaveText("const neu = 3");

      // Deletions keep the old line number and a "−" gutter.
      const deleteRow = hunk.locator('[data-line-kind="delete"]').first();
      await expect(deleteRow.locator("span").nth(0)).toHaveText("7");
      await expect(deleteRow.locator("span").nth(1)).toHaveText("");
      await expect(deleteRow.locator("span").nth(2)).toHaveText("−");
      await expect(deleteRow.locator("span").nth(3)).toHaveText("const alt = 1");

      // Context rows carry both numbers and no raw patch header lines. The
      // leading context is collapsed to three rows, so the first visible one
      // is line 4 of the file.
      const contextRow = hunk.locator('[data-line-kind="context"]').first();
      await expect(contextRow.locator("span").nth(0)).toHaveText("4");
      await expect(contextRow.locator("span").nth(1)).toHaveText("4");
      await expect(page.getByTestId("session-diff-src/app.ts")).not.toContainText("diff --git");
      await expect(page.getByTestId("session-diff-src/app.ts")).not.toContainText("index 1234567");
    },
  );

  test(
    "shows per-file counts and the session-level summary",
    { tag: ["@feature", "@feature:session-diff-render"] },
    async ({ page }) => {
      await mockApi(page);
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page);

      await expect(page.getByTestId("session-diff-summary")).toContainText("4 Dateien");
      await expect(page.getByTestId("session-diff-summary-additions")).toHaveText("+6");
      await expect(page.getByTestId("session-diff-summary-deletions")).toHaveText("−4");

      // The header splits the path into directory and file name.
      const appFile = page.getByTestId("session-diff-src/app.ts");
      await expect(appFile).toContainText("+4");
      await expect(appFile).toContainText("−3");
      await expect(appFile.locator("summary")).toContainText("src/");
      await expect(appFile.locator("summary")).toContainText("app.ts");

      await expect(page.getByTestId("session-diff-position")).toHaveText("1/4");
      await page.getByTestId("session-diff-next").click();
      await expect(page.getByTestId("session-diff-position")).toHaveText("2/4");
      await expect(page.getByTestId("session-diff-README.md")).toBeVisible();
    },
  );

  test(
    "unreadable and binary patches degrade into readable notes",
    { tag: ["@feature", "@feature:session-diff-render"] },
    async ({ page }) => {
      await mockApi(page, {
        rows: [
          { file: "kaputt.ts", patch: "+++ neu\ndas ist kein patch", additions: 0, deletions: 0, status: "modified" },
          { file: "logo.png", patch: BINARY_PATCH, additions: 0, deletions: 0, status: "modified" },
          { file: "alt/umbenannt.ts", patch: RENAME_PATCH, additions: 1, deletions: 1, status: "added" },
        ],
      });
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page);

      await expect(page.getByTestId("session-diff-logo.png")).toContainText("Binärdatei");
      await expect(page.getByTestId("session-diff-logo.png")).not.toContainText("Binary files");
      await expect(page.getByTestId("session-diff-alt/umbenannt.ts")).toContainText("Umbenannt:");
      await expect(page.getByTestId("session-diff-alt/umbenannt.ts")).toContainText("alt/alt.ts → alt/umbenannt.ts");
      await expect(page.getByTestId("session-diff-kaputt.ts")).toContainText("Nicht lesbare Zeile:");
      // No crash and no raw patch dump anywhere.
      await expect(page.getByTestId("session-diff-view")).toBeVisible();
      await expect(page.getByTestId("session-diff-kaputt.ts")).not.toContainText("+++ neu");
    },
  );

  test(
    "expands collapsed context and toggles the unified/split view",
    { tag: ["@feature", "@feature:session-diff-render"] },
    async ({ page }) => {
      await mockApi(page);
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page, "src/app.ts");

      const hunk = page.getByTestId("session-diff-hunk-src/app.ts-0");
      const expandBefore = page.getByTestId("session-diff-hunk-src/app.ts-0-expand-before");
      await expect(expandBefore).toContainText("3 Kontextzeilen anzeigen");
      await expect(hunk.locator('[data-line-kind="context"]')).toHaveCount(6);

      await expandBefore.click();
      await expect(expandBefore).toContainText("Kontext ausblenden");
      await expect(hunk.locator('[data-line-kind="context"]')).toHaveCount(9);

      // Unified is the default; the segmented control switches to split.
      await expect(hunk).toHaveAttribute("data-style", "unified");
      await page.getByTestId("session-diff-style-split").click();
      const splitHunk = page.getByTestId("session-diff-hunk-src/app.ts-0");
      await expect(splitHunk).toHaveAttribute("data-style", "split");
      // The expanded leading context adds three more paired rows.
      await expect(splitHunk.locator('[data-line-kind="pair"]')).toHaveCount(11);
      await page.getByTestId("session-diff-style-unified").click();
      await expect(page.getByTestId("session-diff-hunk-src/app.ts-0")).toHaveAttribute("data-style", "unified");
    },
  );

  test(
    "shows the empty-changes card when the change set is empty",
    { tag: ["@feature", "@feature:session-diff-render"] },
    async ({ page }) => {
      await mockApi(page, { rows: [], vcs: "git" });
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page);

      await expect(page.getByTestId("session-diff-empty-changes")).toBeVisible();
      await expect(page.getByTestId("session-diff-empty-changes")).toContainText("Keine Änderungen");
      await expect(page.getByTestId("session-diff-empty-no-git")).toHaveCount(0);
    },
  );

  test(
    "shows the no-git card with the init action when the project has no repository",
    { tag: ["@feature", "@feature:session-diff-render"] },
    async ({ page }) => {
      await mockApi(page, { rows: [], vcs: "none" });
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page);

      const card = page.getByTestId("session-diff-empty-no-git");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Kein Git-Repository");
      await expect(page.getByTestId("session-diff-empty-changes")).toHaveCount(0);

      // The action asks for a German confirm, then POSTs to /api/vcs/init.
      const initCalls: string[] = [];
      await page.route("**/api/vcs/init**", async (route: Route) => {
        initCalls.push(route.request().url());
        await route.fulfill({ status: 204, contentType: "application/json", body: "" });
      });
      await page.getByTestId("session-diff-init-git").click();
      const confirmButton = page.getByRole("button", { name: "Erstellen", exact: true });
      await expect(confirmButton).toBeVisible();
      await confirmButton.click();
      await expect.poll(() => initCalls).toHaveLength(1);
      await expect(initCalls[0]).toContain("location%5Bdirectory%5D=%2Frepo%2Fa");
      await expect(page.getByText("Git-Repository erstellt")).toBeVisible();
    },
  );

  test(
    "keeps long rows scrollable at 360px without overlapping the composer",
    { tag: ["@feature", "@feature:session-diff-render", "@regression"] },
    async ({ page }) => {
      await mockApi(page);
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(`/sessions/${SESSION}?server=${server.id}`);
      await openDiff(page, "src/app.ts");

      // The rows scroll inside their own container (long code lines must not
      // stretch the page).
      const scrollable = page.getByTestId("session-diff-src/app.ts").locator("div.overflow-x-auto");
      const metrics = await scrollable.evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
      expect(metrics.scroll).toBeGreaterThan(metrics.client);

      // The scroll box stays inside the 360px viewport.
      const box = await scrollable.boundingBox();
      expect(box).not.toBeNull();
      if (box !== null) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(361);
      }

      // Scrolling the page raises the jump button; the diff rows must never
      // cover it or the composer (both stay the topmost hit targets).
      await page.mouse.wheel(0, 200);
      await expect(page.getByTestId("jump-to-newest")).toBeVisible();
      const covered = await page.evaluate(() => {
        const hitTest = (selector: string) => {
          const element = document.querySelector(selector);
          if (element === null) return "missing";
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit !== null && (element === hit || element.contains(hit)) ? "ok" : "covered";
        };
        return {
          jump: hitTest('[data-testid="jump-to-newest"]'),
          composer: hitTest('[data-testid="prompt-draft-input"]'),
        };
      });
      expect(covered).toEqual({ jump: "ok", composer: "ok" });
      await expect(page.getByTestId("session-composer")).toBeVisible();
    },
  );
});
