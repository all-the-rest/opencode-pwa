import { fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { describe, expect, it, vi } from "vitest";
import ProjectRenameForm, { PROJECT_COLOR_PALETTE } from "./ProjectRenameForm.tsx";

/**
 * The rename dialog must default to the colour the server already reports for
 * the project (`Project.icon.color`, handed in as `initialColor` via
 * `projectIconColor`), never to an arbitrary palette entry — and only fall back
 * to "no colour" when the server sent none. This locks that owner requirement:
 * a rename that does not touch the colour must not re-send (and thus never
 * clears) the server colour.
 */
const SERVER_COLOR = "oklch(0.72 0.19 264)"; // PROJECT_COLOR_PALETTE[0]

function renderForm(options: { initialName?: string; initialColor?: string } = {}) {
  const onSubmit = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ProjectRenameForm
        initialName={options.initialName ?? "app"}
        initialColor={options.initialColor}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onSubmit };
}

describe("ProjectRenameForm (default colour)", () => {
  it("defaults the selected colour to the server-reported icon.color", () => {
    renderForm({ initialColor: SERVER_COLOR });
    // The swatch matching the server colour is the pre-selected one.
    expect(screen.getByTestId(`project-rename-color-${SERVER_COLOR}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not send a colour on an untouched rename (keeps the server colour)", () => {
    const { onSubmit } = renderForm({ initialColor: SERVER_COLOR });
    fireEvent.click(screen.getByTestId("project-rename-save"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // No `color` key: the PATCH carries the name only, the server colour stays.
    expect(onSubmit).toHaveBeenCalledWith({ name: "app" });
  });

  it("selects no palette swatch when the server sent no colour", () => {
    renderForm();
    for (const swatch of PROJECT_COLOR_PALETTE) {
      expect(screen.getByTestId(`project-rename-color-${swatch}`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    // Without a server colour there is nothing to reset — the "Standard" button
    // is not offered.
    expect(screen.queryByTestId("project-rename-color-clear")).toBeNull();
    // A name-only rename therefore stays name-only.
  });
});

/**
 * "Zurücksetzen" clears the custom display name (`PATCH /api/project/{id}`
 * with `name: ""` is live-verified: 200, the name becomes null and the label
 * falls back to the path). It is offered only where it changes something —
 * an unnamed project (empty name, or a name that still reads like its path)
 * already shows the path-derived label.
 */
describe("ProjectRenameForm (name reset)", () => {
  it("submits an empty name through the same onSubmit as a rename", () => {
    const { onSubmit } = renderForm({ initialName: "Mein App" });
    fireEvent.click(screen.getByTestId("project-rename-reset"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ name: "" });
  });

  it("resets the name only — a chosen colour is not part of the payload", () => {
    const { onSubmit } = renderForm({ initialName: "Mein App" });
    fireEvent.click(screen.getByTestId("project-rename-color-oklch(0.72 0.19 150)"));
    fireEvent.click(screen.getByTestId("project-rename-reset"));
    expect(onSubmit).toHaveBeenCalledWith({ name: "" });
  });

  it("does not submit the form (the rename dialog stays in control)", () => {
    const { onSubmit } = renderForm({ initialName: "Mein App" });
    const button = screen.getByTestId("project-rename-reset");
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("offers no reset for an unnamed project (empty name)", () => {
    renderForm({ initialName: "" });
    expect(screen.queryByTestId("project-rename-reset")).toBeNull();
  });

  it("offers no reset when the name still is the path (server default)", () => {
    renderForm({ initialName: "/srv/app" });
    expect(screen.queryByTestId("project-rename-reset")).toBeNull();
  });
});
