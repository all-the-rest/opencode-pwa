import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import Icon from "./Icon.tsx";
import type { SessionRunRetry, SessionRunState } from "../lib/eventHub.ts";

/**
 * Live run indicators for the chat, driven by the derived session run state:
 *   - a "Denkt…" working row while a turn is active and no assistant parts have
 *     arrived yet (shimmer, matching wave 1's tool-title shimmer);
 *   - a provider-retry card (attempt, live countdown to the next attempt, the
 *     provider's message) while a retry is scheduled;
 *   - an interrupted divider once a turn was interrupted;
 *   - a card-style error state (never an alert box) once a turn failed.
 *
 * Rendered directly under the message list — cheap: nothing here re-renders the
 * message rows, and the only timer (the retry countdown) lives at 1 Hz.
 */

/** Shimmering "Denkt…" row with a gentle three-dot pulse. */
function WorkingRow() {
  return (
    <div
      className="flex items-center gap-2 text-sm opacity-80"
      data-testid="run-working"
      role="status"
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="run-dot size-1.5 rounded-full bg-current" />
        <span className="run-dot run-dot-2 size-1.5 rounded-full bg-current" />
        <span className="run-dot run-dot-3 size-1.5 rounded-full bg-current" />
      </span>
      <span className="tool-title-shimmer">
        <Trans>Denkt…</Trans>
      </span>
    </div>
  );
}

/** A centered divider line marking an interrupted turn. */
function InterruptedDivider() {
  return (
    <div
      className="flex items-center gap-2 text-xs opacity-70 my-1"
      data-testid="run-interrupted"
      role="separator"
    >
      <span className="h-px flex-1 bg-base-300" aria-hidden="true" />
      <span className="flex items-center gap-1 whitespace-nowrap">
        <Icon name="stop" />
        <Trans>Ausführung unterbrochen</Trans>
      </span>
      <span className="h-px flex-1 bg-base-300" aria-hidden="true" />
    </div>
  );
}

/** Card-style error state for a failed turn (matching wave 1's error cards). */
function RunErrorCard({ message }: { message: string | null }) {
  return (
    <div
      className="card rounded border border-error/50 bg-error/10 p-2 mt-1"
      data-testid="run-error"
    >
      <p className="text-sm font-semibold text-error flex items-center gap-1">
        <Icon name="close" className="size-4" />
        <Trans>Ausführung fehlgeschlagen</Trans>
      </p>
      {message !== null && message !== "" && (
        <p className="text-xs break-words mt-1" data-testid="run-error-message">
          {message}
        </p>
      )}
    </div>
  );
}

/** Live countdown to the next attempt, when the server sent a target time. */
function RetryCountdown({ at }: { at: number | null }) {
  const [remaining, setRemaining] = useState<number | null>(() =>
    at === null ? null : Math.max(0, Math.round((at - Date.now()) / 1000)),
  );
  useEffect(() => {
    if (at === null) {
      setRemaining(null);
      return;
    }
    const tick = (): void => setRemaining(Math.max(0, Math.round((at - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [at]);
  if (remaining === null) return null;
  // Hoist the locale-formatted number out of the message (no expressions in
  // Lingui messages).
  const seconds = remaining.toLocaleString("de-DE");
  return (
    <span data-testid="run-retry-countdown">
      <Trans>Nächster Versuch in {seconds} s</Trans>
    </span>
  );
}

/** Provider-retry card: attempt, countdown (when available) and provider message. */
function RetryCard({ retry }: { retry: SessionRunRetry }) {
  const attempt = retry.attempt.toLocaleString("de-DE");
  return (
    <div
      className="card rounded border border-warning/50 bg-warning/10 p-2 mt-1"
      data-testid="run-retry"
    >
      <p className="text-sm font-semibold flex items-center gap-1">
        <Icon name="refresh" className="size-4" />
        <Trans>Neuer Versuch</Trans>
      </p>
      <div className="text-xs opacity-80 flex flex-wrap items-center gap-2 mt-1">
        <span data-testid="run-retry-attempt">
          <Trans>Versuch {attempt}</Trans>
        </span>
        <RetryCountdown at={retry.at} />
      </div>
      {retry.message !== "" && (
        <p className="text-xs break-words mt-1" data-testid="run-retry-message">
          {retry.message}
        </p>
      )}
    </div>
  );
}

export default function SessionRunIndicators({
  run,
  showWorking,
}: {
  run: SessionRunState;
  /** True only while a turn is active and no assistant parts have arrived yet. */
  showWorking: boolean;
}) {
  if (run.status === "active") {
    return showWorking ? <WorkingRow /> : null;
  }
  if (run.status === "retry") {
    return run.retry !== null ? <RetryCard retry={run.retry} /> : null;
  }
  if (run.status === "interrupted") {
    return <InterruptedDivider />;
  }
  if (run.status === "failed") {
    return <RunErrorCard message={run.error} />;
  }
  return null;
}
