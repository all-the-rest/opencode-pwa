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

function renderForm(options: { initialColor?: string } = {}) {
  const onSubmit = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ProjectRenameForm
        initialName="app"
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
