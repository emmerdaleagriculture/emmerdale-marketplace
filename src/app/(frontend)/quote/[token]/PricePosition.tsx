import q from './quote.module.css';

/**
 * Where this contractor's price sits among the others on the same job.
 *
 * Never a price and never a name: a rank, a count, and a position on a bar.
 * The decision about whether it is safe to show anything at all lives in SQL
 * (sq_quote_position returns no row below the bidder threshold), so this
 * component only ever renders when there are already enough prices that the
 * bar cannot point at one particular rival.
 *
 * Deliberately no axis and no numbers on the bar. The marker says "roughly
 * here between the cheapest and the dearest" — enough to tell a contractor
 * they are out of step, not enough to reverse-engineer what anyone quoted.
 */
export function PricePosition({
  rank,
  total,
  position,
}: {
  rank: number;
  total: number;
  /**
   * 0 = cheapest, 1 = dearest. Null when every price is identical.
   * Comes from sq_quote_position's `price_position` — `position` is reserved
   * in Postgres and cannot be a column name there.
   */
  position: number | null;
}) {
  // All prices equal: a marker at either end would be a lie, so sit it in the
  // middle and let the words carry the meaning.
  const pos = position ?? 0.5;
  const pct = Math.round(pos * 100);

  const summary =
    rank === 1
      ? 'Yours is the lowest price'
      : rank === total
        ? 'Yours is the highest price'
        : `Yours is ${rank}${ordinal(rank)} of ${total} prices`;

  return (
    <div className={q.posWrap}>
      <div className={q.posHead}>
        <span className={q.posSummary}>{summary}</span>
        <span className={q.posCount}>{total} contractors have priced this job</span>
      </div>

      <div
        className={q.posTrack}
        role="img"
        aria-label={`${summary}. ${
          position === null
            ? 'Every price on this job is the same.'
            : `Your price sits ${pct}% of the way between the lowest and the highest.`
        }`}
      >
        <span className={q.posFill} style={{ width: `${pct}%` }} />
        <span className={q.posMarker} style={{ left: `${pct}%` }} />
      </div>

      <div className={q.posScale}>
        <span>Lowest</span>
        <span>Highest</span>
      </div>

      <p className={q.posNote}>
        {position === null
          ? 'Every price on this job is the same.'
          : 'Relative only — no other contractor’s price is shown, and yours is never shown to them.'}
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
