import { useEffect, useState } from "react";

/**
 * A shared 1 Hz clock for elapsed-runtime labels ("4:12"). Only ticks while
 * `active` is true — the running strip renders nothing when no work runs, and
 * then no timer exists either.
 */
export function useTickingNow(active: boolean, intervalMs: number = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [active, intervalMs]);

  return now;
}
