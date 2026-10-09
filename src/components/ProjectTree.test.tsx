import { fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTree from "./ProjectTree.tsx";
import { buildProjectTree } from "../lib/projectTree.ts";
import type { ProjectInfo } from "../lib/opencode.ts";

vi.mock("../lib/opencode.ts", async (importOriginal) => {
  // The tree only needs the types — the mocked module keeps the rest real.
  const actual = await importOriginal<typeof import("../lib/opencode.ts")>();
  return { ...actual };
});

function project(id: string, canonical?: string, name?: string): ProjectInfo {
  return { id, name: name ?? canonical ?? id, ...(canonical === undefined ? {} : { canonical }) };
}

/** Setup that produces a real tree: a project that is also a parent. */
const NESTED = [
  project("p-app", "/srv/app"),
  project("p-api", "/srv/app/services/api"),
  project("p-web", "/home/dev/web"),
];

interface TreeProps {
  onStartRename?: (project: ProjectInfo) => void;
  onRename?: (project: ProjectInfo, patch: { name: string; color?: string | null }) => void;
  renamingID?: string | null;
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
          tree={buildProjectTree(NESTED)}
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
    expect(screen.getByTestId("project-node-/srv")).toBeInTheDocument();
    expect(screen.getByTestId("project-node-/srv/app")).toBeInTheDocument();
    // The intermediate directory carries no project of its own …
    expect(screen.getByTestId("project-node-/srv/app/services")).toBeInTheDocument();
    // … and every project keeps the flat-list testid.
    expect(screen.getByTestId("project-row-p-app")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-api")).toBeInTheDocument();
    expect(screen.getByTestId("project-row-p-web")).toBeInTheDocument();
  });

  it("collapses and expands a branch on toggle", () => {
    renderTree();
    const toggle = screen.getByTestId("project-toggle-/srv/app");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.getByTestId("project-toggle-/srv/app")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("project-row-p-api")).toBeNull();
    fireEvent.click(screen.getByTestId("project-toggle-/srv/app"));
    expect(screen.getByTestId("project-row-p-api")).toBeInTheDocument();
  });

  it("collapsing a root hides its whole branch", () => {
    renderTree();
    fireEvent.click(screen.getByTestId("project-toggle-/srv"));
    expect(screen.queryByTestId("project-row-p-app")).toBeNull();
    expect(screen.queryByTestId("project-row-p-api")).toBeNull();
    // The other root is unaffected.
    expect(screen.getByTestId("project-row-p-web")).toBeInTheDocument();
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
