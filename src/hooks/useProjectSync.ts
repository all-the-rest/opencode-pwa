import { useEffect } from "react";
import { subscribeServerEvents } from "../lib/eventHub.ts";
import { applyProjectUpdate } from "../lib/projectTree.ts";
import { extractProjectUpdated, type ProjectInfo, type ServerConfig } from "../lib/opencode.ts";

/**
 * Live sync of the project list from `project.updated` events.
 *
 * Verified event shape (`ProjectUpdated`, types.d.ts:2254): the full project
 * rides along in `data`, so a rename from the original GUI (or another tab)
 * patches the local list without a round-trip. Anything else on the stream is
 * ignored here — the 5s list refresh of `useLiveRefresh` stays the net.
 */
export function useProjectSync(
  server: ServerConfig | null,
  setProjects: React.Dispatch<React.SetStateAction<ProjectInfo[]>>,
): void {
  useEffect(() => {
    if (server === null) return;
    const active: ServerConfig = server;
    return subscribeServerEvents(active, (event: unknown) => {
      const updated = extractProjectUpdated(event);
      if (updated === null) return;
      setProjects((prev) => applyProjectUpdate(prev, updated));
    });
  }, [server, setProjects]);
}
