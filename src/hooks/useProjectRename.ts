import { useCallback } from "react";
import { t } from "@lingui/core/macro";
import {
  updateProject,
  type ProjectInfo,
  type ServerConfig,
} from "../lib/opencode.ts";
import {
  applyProjectUpdate,
  patchedProject,
  type ProjectRenamePatch,
} from "../lib/projectTree.ts";
import { useToast } from "../state/toast.tsx";

/**
 * Project rename with optimistic update, rollback and toast — the session
 * rename pattern (`SessionTabBar.commitRename`) applied to projects.
 *
 * The list patches immediately (the label switches at once), the PATCH runs
 * behind it, and a failure rolls the previous project back and explains
 * itself in a toast (never a blocking dialog). On success the optimistic
 * patch stays: `project.updated` (or the 5s list refresh) reconciles the rest.
 */
export function useProjectRename(
  server: ServerConfig | null,
  setProjects: React.Dispatch<React.SetStateAction<ProjectInfo[]>>,
): (project: ProjectInfo, patch: ProjectRenamePatch) => Promise<boolean> {
  const { notify } = useToast();

  return useCallback(
    async (project: ProjectInfo, patch: ProjectRenamePatch) => {
      if (server === null) {
        notify(t`Kein Server ausgewählt.`, "error");
        return false;
      }
      const active: ServerConfig = server;
      const optimistic = patchedProject(project, patch);
      setProjects((prev) => applyProjectUpdate(prev, optimistic));
      const result = await updateProject(active, project.id, patch);
      if (result.error !== null) {
        // Roll back to exactly what we had — no guessing.
        setProjects((prev) => applyProjectUpdate(prev, project));
        const renameError = result.error;
        notify(t`Umbenennen fehlgeschlagen: ${renameError}`, "error");
        return false;
      }
      notify(t`Projekt gespeichert.`, "success");
      return true;
    },
    [server, setProjects, notify],
  );
}
