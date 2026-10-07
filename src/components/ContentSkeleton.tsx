import { t } from "@lingui/core/macro";

/**
 * Pulsing placeholder cards while a page loads its server data — replaces the
 * lone spinner with a skeleton that matches the card grid, so the layout does
 * not jump when the content arrives.
 */
export default function ContentSkeleton({
  cards,
  testId,
  className = "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
}: {
  cards: number;
  testId: string;
  className?: string;
}) {
  return (
    <div className={className} role="status" aria-label={t`Lädt`} data-testid={testId}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="card bg-base-200 shadow" aria-hidden="true">
          <div className="card-body gap-2">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
