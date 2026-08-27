import s from './RatingStars.module.css';

/**
 * Display-only rating: "★★★★☆ 4.6 · 12 jobs", or a neutral "New" badge below
 * the 3-rating threshold (§18a cold start — neither penalised nor inflated).
 */
export function RatingStars({
  avg,
  count,
}: {
  avg: number | null;
  count: number;
}) {
  if (avg === null || count < 3) {
    return <span className={s.newBadge}>New</span>;
  }
  const full = Math.round(avg);
  return (
    <span className={s.stars} aria-label={`Rated ${avg.toFixed(1)} out of 5 from ${count} jobs`}>
      <span aria-hidden="true">
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>{' '}
      {avg.toFixed(1)} · {count} job{count === 1 ? '' : 's'}
    </span>
  );
}
