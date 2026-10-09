import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { isPathLike } from "../lib/projectTree.ts";

/** Icon colors the rename dialog offers (`Project.icon.color`). */
export const PROJECT_COLOR_PALETTE: readonly string[] = [
  "oklch(0.72 0.19 264)",
  "oklch(0.72 0.19 150)",
  "oklch(0.72 0.19 60)",
  "oklch(0.72 0.19 30)",
  "oklch(0.72 0.19 330)",
  "oklch(0.72 0.19 200)",
];

export interface ProjectRenameFormProps {
  initialName: string;
  /** Color the project currently carries on the server, when known. */
  initialColor?: string;
  /**
   * Called with the trimmed name and the color when it changed. The
   * "Zurücksetzen" action calls it with `{ name: "" }` (the display name
   * then falls back to the path-derived label on the server).
   */
  onSubmit: (patch: { name: string; color?: string | null }) => void;
  onCancel: () => void;
  /** Disables the inputs while the PATCH is in flight. */
  busy?: boolean;
  /** Prefix for every testid; defaults to `project-rename`. */
  testId?: string;
}

/**
 * Inline rename form for one project: display name plus an optional icon
 * color. Presentational on purpose — the caller owns the optimistic update,
 * the PATCH and the toasts (`useProjectRename`), exactly like the session
 * rename in `SessionTabBar`/`SessionDetail`.
 *
 * A project that already carries a custom display name also offers
 * "Zurücksetzen": it submits `{ name: "" }` and the server falls back to the
 * path-derived name (live-verified 200, unlike the session title reset).
 */
export default function ProjectRenameForm({
  initialName,
  initialColor,
  onSubmit,
  onCancel,
  busy = false,
  testId = "project-rename",
}: ProjectRenameFormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor ?? null);

  // The reset only exists where it changes something: a project whose name is
  // empty or still reads like its path is already showing the path-derived
  // label (`projectTreeLabel`/`isPathLike`) — the server default, not a name
  // the user chose. Verified live: `PATCH /api/project/{id}` with `name: ""`
  // answers 200 and clears the name, so the display name falls back to the
  // path. Unlike sessions (their empty title is silently dropped), projects
  // have a real reset path.
  const hasCustomName = initialName.trim() !== "" && !isPathLike(initialName);

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    // A color the user did not touch is not sent at all — otherwise a rename
    // would silently clear the project's server color.
    const previous = initialColor ?? null;
    onSubmit({ name: trimmed, ...(color === previous ? {} : { color }) });
  }

  return (
    <form
      className="flex flex-col gap-2"
      data-testid={`${testId}-form`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input input-bordered input-sm min-w-0 flex-1"
          value={name}
          autoFocus
          disabled={busy}
          aria-label={t`Neuer Projektname`}
          placeholder={t`Neuer Projektname`}
          data-testid={`${testId}-input`}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <button
          type="submit"
          className="btn btn-sm btn-primary"
          disabled={busy || name.trim() === ""}
          data-testid={`${testId}-save`}
        >
          <Trans>Speichern</Trans>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={onCancel}
          data-testid={`${testId}-cancel`}
        >
          <Trans>Abbrechen</Trans>
        </button>
        {/* Reset the display name back to the path-derived default. Sends
            `{ name: "" }` through the same hook (optimistic + rollback +
            toast); the page handler closes the form once the PATCH saved. */}
        {hasCustomName && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={busy}
            title={t`Anzeigenamen zurücksetzen – das Projekt zeigt wieder seinen Pfad.`}
            aria-label={t`Namen zurücksetzen`}
            data-testid={`${testId}-reset`}
            onClick={() => onSubmit({ name: "" })}
          >
            <Trans>Zurücksetzen</Trans>
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t`Projektfarbe`}>
        <span className="text-xs opacity-70 mr-1">
          <Trans>Farbe:</Trans>
        </span>
        {PROJECT_COLOR_PALETTE.map((swatch) => {
          const active = color === swatch;
          return (
            <button
              key={swatch}
              type="button"
              className={`btn btn-xs btn-circle${active ? " btn-active" : ""}`}
              style={{ backgroundColor: swatch }}
              disabled={busy}
              aria-label={t`Farbe ${swatch}`}
              aria-pressed={active}
              title={t`Farbe setzen`}
              data-testid={`${testId}-color-${swatch}`}
              onClick={() => setColor(active ? null : swatch)}
            />
          );
        })}
        {initialColor !== undefined && (
          <button
            type="button"
            className={`btn btn-xs btn-ghost${color === null ? " btn-active" : ""}`}
            disabled={busy}
            aria-label={t`Farbe zurücksetzen`}
            aria-pressed={color === null}
            data-testid={`${testId}-color-clear`}
            onClick={() => setColor(null)}
          >
            <Trans>Standard</Trans>
          </button>
        )}
      </div>
    </form>
  );
}
