import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * Per-row markers of the session lists (shared by the list rows, the project
 * rows and the search results):
 *   - "offen" badge when the session already has a tab open (state we already
 *     have: `useSessionTabs`)
 *   - an unread dot when the session became active while it was not the open
 *     one (state we already have: the event hub's derived run state)
 * Nothing renders when neither applies, so a quiet list stays quiet.
 */
export default function SessionRowMarkers({
  open,
  unread,
  testId = "session-row-markers",
}: {
  open: boolean;
  unread: boolean;
  testId?: string;
}) {
  if (!open && !unread) return null;
  return (
    <span className="flex items-center gap-1 shrink-0" data-testid={testId}>
      {open && (
        <span className="badge badge-success badge-sm" data-testid="session-row-open">
          <Trans>offen</Trans>
        </span>
      )}
      {unread && (
        <span
          className="inline-block h-2 w-2 rounded-full bg-primary"
          data-testid="session-row-unread"
          title={t`Ungelesene Aktivität`}
        />
      )}
    </span>
  );
}
