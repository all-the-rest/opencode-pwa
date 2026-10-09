import { fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { beforeEach, describe, expect, it } from "vitest";
import SessionDiffView from "./SessionDiffView.tsx";
import type { SessionDiffRow } from "../lib/opencode.ts";

/**
 * The diff tab used to open fully collapsed: the screenshot showed only the
 * per-file list and the rendered unified diff stayed invisible until a file
 * was expanded by hand. The reference UI shows the first file's diff inline,
 * so the first `<details>` starts open while every later file stays collapsed.
 */

const rows: SessionDiffRow[] = [
  {
    file: "src/a.ts",
    patch: ["@@ -1,3 +1,3 @@", " unchanged", "-old", "+new", " tail"].join("\n"),
    additions: 1,
    deletions: 1,
    status: "modified",
  },
  {
    file: "src/b.ts",
    patch: ["@@ -0,0 +1,2 @@", "+one", "+two"].join("\n"),
    additions: 2,
    deletions: 0,
    status: "added",
  },
  {
    file: "src/c.ts",
    patch: ["@@ -1,1 +0,0 @@", "-gone"].join("\n"),
    additions: 0,
    deletions: 1,
    status: "deleted",
  },
];

function renderView() {
  render(
    <I18nProvider i18n={i18n}>
      <SessionDiffView rows={rows} />
    </I18nProvider>,
  );
}

/** The `<details>` element of one file row (the per-file list item holds it). */
function detailsOf(file: string): HTMLDetailsElement {
  const element = screen.getByTestId(`session-diff-${file}`).querySelector("details");
  if (element === null) throw new Error(`no <details> for ${file}`);
  return element as HTMLDetailsElement;
}

describe("SessionDiffView (default open file)", () => {
  beforeEach(() => {
    // jsdom has no layout engine: `showFile` scrolls the target into view.
    Element.prototype.scrollIntoView = () => {};
  });

  it("starts the first file expanded and keeps the later ones collapsed", () => {
    renderView();
    // First file: the diff is visible without a click …
    expect(detailsOf("src/a.ts").open).toBe(true);
    // … every later file stays collapsed.
    expect(detailsOf("src/b.ts").open).toBe(false);
    expect(detailsOf("src/c.ts").open).toBe(false);
    // The expanded first file really carries its rendered diff.
    expect(screen.getByTestId("session-diff-hunk-src/a.ts-0")).toBeInTheDocument();
  });

  it("keeps the tab structure and every testid intact", () => {
    renderView();
    expect(screen.getByTestId("session-diff-view")).toBeInTheDocument();
    expect(screen.getByTestId("session-diff-summary")).toBeInTheDocument();
    expect(screen.getByTestId("session-diff-summary-additions")).toHaveTextContent("+3");
    expect(screen.getByTestId("session-diff-summary-deletions")).toHaveTextContent("−2");
    expect(screen.getByTestId("session-diff-prev")).toBeInTheDocument();
    expect(screen.getByTestId("session-diff-position")).toHaveTextContent("1/3");
    expect(screen.getByTestId("session-diff-next")).toBeInTheDocument();
    expect(screen.getByTestId("session-diff-style-unified")).toBeInTheDocument();
    expect(screen.getByTestId("session-diff-style-split")).toBeInTheDocument();
    for (const file of ["src/a.ts", "src/b.ts", "src/c.ts"]) {
      expect(screen.getByTestId(`session-diff-${file}`)).toBeInTheDocument();
    }
  });

  it("opens a collapsed file imperatively on prev/next, even a manually collapsed first one", () => {
    renderView();
    const first = detailsOf("src/a.ts");
    const second = detailsOf("src/b.ts");
    const third = detailsOf("src/c.ts");
    // The user collapses the default-open file by hand.
    first.open = false;

    // Prev wraps to the last file and opens it.
    fireEvent.click(screen.getByTestId("session-diff-prev"));
    expect(third.open).toBe(true);
    expect(screen.getByTestId("session-diff-position")).toHaveTextContent("3/3");

    // Prev again moves on and opens the next one back.
    fireEvent.click(screen.getByTestId("session-diff-prev"));
    expect(second.open).toBe(true);
    expect(screen.getByTestId("session-diff-position")).toHaveTextContent("2/3");

    // Prev once more targets the (collapsed) first file — `showFile` re-opens it.
    fireEvent.click(screen.getByTestId("session-diff-prev"));
    expect(first.open).toBe(true);
    expect(screen.getByTestId("session-diff-position")).toHaveTextContent("1/3");

    // Next moves on and opens the next file.
    fireEvent.click(screen.getByTestId("session-diff-next"));
    expect(second.open).toBe(true);
    expect(screen.getByTestId("session-diff-position")).toHaveTextContent("2/3");
  });
});
