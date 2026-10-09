/**
 * Skeleton rows for the session lists.
 *
 * A bare spinner says nothing about the shape of what arrives; the original
 * renders placeholder rows of the same height as the real ones
 * (`home-sessions-view.tsx`, `HomeSessionSkeleton`). The rows are `aria-hidden`
 * placeholders (the loading state is announced separately) and use the same
 * gap/height as a real list, so nothing jumps when the data lands.
 */
export default function SessionListSkeleton({
  rows = 4,
  testId = "session-list-skeleton",
}: {
  /** Number of placeholder rows to render. */
  rows?: number;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1" aria-hidden="true" data-testid={testId}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-10 rounded-lg bg-base-300/70 animate-pulse"
          data-testid={index === 0 ? `${testId}-row` : undefined}
        />
      ))}
    </div>
  );
}
