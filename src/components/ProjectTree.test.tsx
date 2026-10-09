import { fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTree from "./ProjectTree.tsx";
import { buildProjectTree } from "../lib/projectTree.ts";
import type { ProjectInfo, ProjectTimeInfo } from "../lib/opencode.ts";

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  // The tree only needs the types — the mocked module keeps the rest real.
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return { ...actual };
});

function project(id: string, canonical?: string, name?: string, time?: ProjectTimeInfo): ProjectInfo {
  return {
    id,
    name: name ?? canonical ?? id,
    ...(canonical === undefined ? {} : { canonical }),
    ...(time === undefined ? {} : { time }),
  };
}

/** Setup that produces a real tree: a project that is also a parent. */
const NESTED = [
  project("p-app", "/srv/app"),
  project("p-api", "/srv/app/services/api"),
  project("p-web", "/home/dev/web"),
];

/**
 * The owner's live payload (the paths they named, including the duplicated
 * `/projects/LuminaRust`): long project-less chains plus a real branch.
 */
const LIVE = [
  project("p-users", "/Users/florianreisinger"),
  project("p-de", "/de"),
  project("p-home-dev", "/home/dev"),
  project("p-octest-live", "/home/dev/.cache/octest/live"),
  project("p-octest-lab", "/home/dev/octest-lab/work"),
  project("p-root", "/projects", "Root"),
  project("p-lumina-old", "/projects/LuminaRust", undefined, {
    created: 10,
    updated: 10,
    active: 10,
  }),
  project("p-lumina", "/projects/LuminaRust", undefined, { created: 10, updated: 99, active: 99 }),
  project("p-ebcont", "/projects/ebcont-seo-test"),
  project("p-ebcont-images", "/projects/ebcont-seo-test/images/dl"),
  project("p-tmp", "/tmp/opencode"),
  project("p-instr", "/tmp/opencode/instr-check"),
  project("p-event", "/tmp/opencode/proj-smoke", "Event Test"),
];

interface TreeProps {
  onStartRename?: (project: ProjectInfo) => void;
  onRename?: (project: ProjectInfo, patch: { name: string; color?: string | null }) => void;
  renamingID?: string | null;
  /** Rows the tree is built from; defaults to {@link NESTED}. */
  rows?: ProjectInfo[];
}

function renderTree(props: TreeProps = {}) {
  const onStartRename = props.onStartRename ?? vi.fn();
  const onRename = props.onRename ?? vi.fn();
  const onCancelRename = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ProjectTree
          serverID="srv-1"
          tree={buildProjectTree(props.rows ?? NESTED)}
          renamingID={props.renamingID ?? null}
          onStartRename={onStartRename}
          onCancelRename={onCancelRename}
          onRename={onRename}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  return { onStartRename, onRename, onCancelRename };
}

describe("ProjectTree", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders nested projects as expandable nodes", () => {
    renderTree();
    expect(screen.getByTestId("project-node-/srv/app")).toBeInTheDocument();
    expect(screen.getByTestId("project-node-/home/dev/web")).toBeInTheDocument();
    // `/srv` and `/srv/app/services` hold no project → compressed away, the
    // api project sits on the row that carries its own chain label.
    expect(screen.getByTestId("project-node-/srv/app/services/api")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-api")).toBeInTheDocument();
    // Every project keeps the flat-list testid.
    expect(screen.getByTestId("project-row-p-app")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-web")).toBeInTheDocument();
  });

  it("shows a compressed chain as one row labelled with the whole path", () => {
    renderTree({ rows: LIVE });
    // One row for `/tmp/opencode`, not one per level.
    const tmp = screen.getByTestId("project-node-/tmp/opencode");
    expect(tmp).toHaveAttribute("data-chain", "true");
    expect(tmp).toHaveTextContent("tmp/opencode");
    // `.cache/octest/live` is three folders in one row.
    const live = screen.getByTestId("project-node-/home/dev/.cache/octest/live");
    expect(live).toHaveAttribute("data-chain", "true");
    expect(screen.getByTestId("project-row-p-octest-live")).toHaveTextContent(".cache/octest/live");
    // A leaf project stays a plain row without a chevron.
    expect(screen.queryByTestId("project-toggle-/home/dev/.cache/octest/live")).toBeNull();
    // A folder with its own project never absorbs its children, so a branch
    // root keeps a single-segment label (here the project's custom "Root").
    const projects = screen.getByTestId("project-node-/projects");
    expect(projects).not.toHaveAttribute("data-chain");
    expect(projects).toHaveTextContent("Root");
    expect(screen.getByTestId("project-row-p-root")).toHaveTextContent("Root");
  });

  it("auto-expands a compressed chain without a click", () => {
    renderTree({ rows: LIVE });
    // Nothing was clicked, yet the project underneath every chain is visible.
    expect(screen.getByTestId("project-row-p-octest-live")).toBeVisible();
    expect(screen.getByTestId("project-row-p-octest-lab")).toBeVisible();
    expect(screen.getByTestId("project-row-p-instr")).toBeVisible();
    expect(screen.getByTestId("project-row-p-event")).toBeVisible();
    expect(screen.getByTestId("project-row-p-ebcont-images")).toBeVisible();
    // The branch points start expanded too …
    expect(screen.getByTestId("project-toggle-/tmp/opencode")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // … and carry the chevron a plain leaf row never has.
    expect(screen.getByTestId("project-toggle-/tmp/opencode")).toBeVisible();
    expect(screen.queryByTestId("project-toggle-/tmp/opencode/proj-smoke")).toBeNull();
  });

  it("collapses the duplicate LuminaRust path to the newest row", () => {
    renderTree({ rows: LIVE });
    // 13 rows in, one row out: the stale twin never rendered.
    expect(screen.getByTestId("project-node-/projects")).toBeInTheDocument();
    expect(screen.queryByTestId("project-row-p-lumina-old")).toBeNull();
    expect(screen.getByTestId("project-row-p-lumina")).toBeInTheDocument();
  });

  it("collapses and expands a branch on toggle", () => {
    renderTree();
    // `/srv` folded into `/srv/app`, so the toggle lives on the app row.
    const toggle = screen.getByTestId("project-toggle-/srv/app");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.getByTestId("project-toggle-/srv/app")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("project-row-p-api")).toBeNull();
    fireEvent.click(screen.getByTestId("project-toggle-/srv/app"));
    expect(screen.getByTestId("project-row-p-api")).toBeInTheDocument();
  });

  it("collapsing a node hides its sub-branch, not its own project", () => {
    renderTree();
    // `/srv` folded into the `/srv/app` row, so that row is the branch head:
    // its own project stays, the nested one goes.
    fireEvent.click(screen.getByTestId("project-toggle-/srv/app"));
    expect(screen.queryByTestId("project-row-p-api")).toBeNull();
    expect(screen.getByTestId("project-row-p-app")).toBeInTheDocument();
    // The other root is unaffected.
    expect(screen.getByTestId("project-row-p-web")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("project-toggle-/srv/app"));
    expect(screen.getByTestId("project-row-p-api")).toBeInTheDocument();
  });

  it("collapsing a branch root hides its subtrees and keeps its own row", () => {
    renderTree({ rows: LIVE });
    const projects = screen.getByTestId("project-node-/projects");
    expect(projects).toHaveTextContent("Root");
    fireEvent.click(screen.getByTestId("project-toggle-/projects"));
    expect(screen.queryByTestId("project-row-p-lumina")).toBeNull();
    expect(screen.queryByTestId("project-row-p-ebcont-images")).toBeNull();
    // The row that owns the toggle stays visible (its project is the folder).
    expect(screen.getByTestId("project-row-p-root")).toBeInTheDocument();
    // The other root is unaffected.
    expect(screen.getByTestId("project-row-p-tmp")).toBeInTheDocument();
  });

  it("hands the project to the rename callback", () => {
    const { onStartRename } = renderTree();
    fireEvent.click(screen.getByTestId("project-rename-p-app"));
    expect(onStartRename).toHaveBeenCalledWith(expect.objectContaining({ id: "p-app" }));
  });

  it("swaps the row into the rename form while renaming", () => {
    const { onRename } = renderTree({ renamingID: "p-app" });
    const input = screen.getByTestId("project-rename-p-app-input") as HTMLInputElement;
    // The form starts from the project's current name (still its path here).
    expect(input).toHaveValue("/srv/app");
    fireEvent.change(input, { target: { value: "Mein App" } });
    fireEvent.click(screen.getByTestId("project-rename-p-app-save"));
    // A color nobody touched is not part of the patch.
    expect(onRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-app" }),
      { name: "Mein App" },
    );
  });

  it("sends a chosen color and clears it again", async () => {
    const colored: ProjectInfo[] = [
      {
        id: "p1",
        name: "Farbig",
        canonical: "/srv/a",
        icon: { color: "oklch(0.72 0.19 264)" },
      },
    ];
    const onRename = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <ProjectTree
            serverID="srv-1"
            tree={buildProjectTree(colored)}
            renamingID="p1"
            onStartRename={vi.fn()}
            onCancelRename={vi.fn()}
            onRename={onRename}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
    // Untouched: only the name goes out.
    fireEvent.change(screen.getByTestId("project-rename-p1-input"), {
      target: { value: "Farbig neu" },
    });
    fireEvent.click(screen.getByTestId("project-rename-p1-save"));
    expect(onRename).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "p1" }),
      { name: "Farbig neu" },
    );

    // Choosing a swatch adds the color.
    fireEvent.click(screen.getByTestId("project-rename-p1-color-oklch(0.72 0.19 150)"));
    fireEvent.click(screen.getByTestId("project-rename-p1-save"));
    expect(onRename).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "p1" }),
      { name: "Farbig neu", color: "oklch(0.72 0.19 150)" },
    );

    // "Standard" clears it.
    fireEvent.click(screen.getByTestId("project-rename-p1-color-clear"));
    fireEvent.click(screen.getByTestId("project-rename-p1-save"));
    expect(onRename).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "p1" }),
      { name: "Farbig neu", color: null },
    );
  });

  it("renders the color dot of a project with an icon color", () => {    const colored: ProjectInfo[] = [
      { id: "p1", name: "Farbig", canonical: "/srv/a", icon: { color: "oklch(0.7 0.2 264)" } },
      { id: "p2", name: "Anders", canonical: "/home/b" },
    ];
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <ProjectTree
            serverID="srv-1"
            tree={buildProjectTree(colored)}
            renamingID={null}
            onStartRename={vi.fn()}
            onCancelRename={vi.fn()}
            onRename={vi.fn()}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId("project-dot-p1")).toHaveStyle({
      backgroundColor: "oklch(0.7 0.2 264)",
    });
    expect(screen.queryByTestId("project-dot-p2")).toBeNull();
  });
});
