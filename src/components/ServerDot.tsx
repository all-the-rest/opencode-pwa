import { serverColor } from "../lib/serverColor.ts";
import type { ServerConfig } from "../lib/opencode.ts";

/**
 * Small color dot identifying a server (tabs, lists, headers). The color
 * comes from the stored entry with a hash-derived fallback, so old entries
 * without a color render deterministically.
 */
export default function ServerDot({ server, testId }: { server: ServerConfig; testId?: string }) {
  const color = serverColor(server);
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
      {...(testId !== undefined ? { "data-testid": testId } : {})}
    />
  );
}
