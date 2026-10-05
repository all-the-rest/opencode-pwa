import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { getShellOutput, type ServerConfig } from "../lib/opencode.ts";

/** Poll interval for tailing shell output while the panel is open. */
export const SHELL_OUTPUT_POLL_INTERVAL_MS = 2000;

export interface ShellOutputStreamState {
  output: string;
  cursor: number;
  truncated: boolean;
  /** True until the first fetch answered. */
  loading: boolean;
  error: string | null;
  /** True while the tail is actively polling (panel open, no error). */
  live: boolean;
}

/**
 * Tail-poll a shell's output: initial fetch from the start, then
 * `shell.output` with the last cursor every `intervalMs` while `open` is
 * true. Polling stops on close and on unmount; incremental chunks are
 * appended, a `truncated` response (server could only return the tail)
 * replaces the text.
 */
export function useShellOutputStream(
  server: ServerConfig | null,
  shellId: string | null,
  open: boolean,
  intervalMs: number = SHELL_OUTPUT_POLL_INTERVAL_MS,
): ShellOutputStreamState {
  const [output, setOutput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef(0);

  useEffect(() => {
    if (server === null || shellId === null || !open) return;
    const activeServer: ServerConfig = server;
    const activeShell: string = shellId;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    cursorRef.current = 0;
    setOutput("");
    setCursor(0);
    setTruncated(false);
    setError(null);
    setLoading(true);

    async function poll(withCursor: boolean): Promise<void> {
      const result = await getShellOutput(
        activeServer,
        activeShell,
        withCursor ? cursorRef.current : undefined,
      );
      if (cancelled) return;
      setLoading(false);
      if (result.error !== null || result.data === null) {
        setError(result.error ?? t`Ausgabe konnte nicht geladen werden.`);
        return;
      }
      const fresh = result.data;
      cursorRef.current = fresh.cursor;
      setCursor(fresh.cursor);
      setTruncated(fresh.truncated);
      // `truncated` is the server's own signal that it could only return the
      // tail, so the accumulated buffer is replaced instead of appended.
      setOutput((prev) => (fresh.truncated ? fresh.output : prev + fresh.output));
    }

    void poll(false).then(() => {
      if (cancelled) return;
      timer = setInterval(() => void poll(true), intervalMs);
    });

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [server, shellId, open, intervalMs]);

  const live = open && server !== null && shellId !== null && error === null;
  return { output, cursor, truncated, loading, error, live };
}
