import { Trans } from "@lingui/react/macro";

/**
 * Header-level reachability badge for one server: green "Online" while the
 * last load succeeded, amber "Offline" while it failed. Complements the
 * color-only `ServerDot` (decorative) with an explicit text state.
 */
export default function ServerStatusBadge({
  offline,
  testId,
}: {
  offline: boolean;
  testId?: string;
}) {
  if (offline) {
    return (
      <span className="badge badge-warning" data-testid={testId ?? "server-status-offline"}>
        <Trans>Offline</Trans>
      </span>
    );
  }
  return (
    <span className="badge badge-success" data-testid={testId ?? "server-status-online"}>
      <Trans>Online</Trans>
    </span>
  );
}
