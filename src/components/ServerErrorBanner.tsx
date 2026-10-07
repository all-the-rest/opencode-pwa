import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { isAuthFailure } from "../lib/serverAuthError.ts";

interface ServerErrorBannerProps {
  /** Stringified load error as stored in page state (technical detail). */
  error: string;
  testId?: string;
  /** Extra hint rendered below the message (e.g. the retry note). */
  children?: ReactNode;
}

/**
 * Offline/auth banner for server pages. A rejected login (401/403: wrong
 * username or server password) shows a friendly German message with the
 * technical error kept in a collapsed `<details>`; every other failure
 * (network down, server gone) keeps the existing offline text verbatim.
 */
export default function ServerErrorBanner({
  error,
  testId = "offline-alert",
  children,
}: ServerErrorBannerProps) {
  if (isAuthFailure(error)) {
    return (
      <div className="alert alert-warning" data-testid={testId}>
        <span>
          <Trans>
            Anmeldung fehlgeschlagen. Bitte Benutzername und Server-Passwort in den
            Einstellungen prüfen.
          </Trans>
        </span>
        <details className="text-xs" data-testid={`${testId}-details`}>
          <summary>
            <Trans>Technische Details</Trans>
          </summary>
          <span className="break-all">{error}</span>
        </details>
        {children}
      </div>
    );
  }
  return (
    <div className="alert alert-warning" data-testid={testId}>
      <span>
        <Trans>Server offline oder nicht erreichbar: {error}</Trans>
      </span>
      {children}
    </div>
  );
}
