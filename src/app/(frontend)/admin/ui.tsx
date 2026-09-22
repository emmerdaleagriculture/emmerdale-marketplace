import s from './admin.module.css';

/**
 * The pieces every admin page was building for itself.
 *
 * A survey of the admin found the status-pill map written out five times, the
 * metric tile hand-rolled in seven files plus a local component in an eighth,
 * forty-two tables assembled by hand against the same two class names, and a
 * relative-time formatter defined twice with two different answers for "just
 * now". None of that was anybody's mistake — there was nowhere to put a
 * shared piece, so each page reasonably made its own.
 *
 * This is that somewhere. Shared markup, not shared CSS: admin.module.css was
 * already common, which is exactly why five pages could drift while all
 * looking alike.
 */

/**
 * Status → tone, for every status any admin list shows.
 *
 * One map rather than five. The five it replaces covered different domains —
 * jobs, leads, contractors — and disagreed about nothing, because they all
 * resolved to the same three tones. The union has no collisions: a word means
 * the same thing on whichever page it appears.
 */
const TONE: Record<string, string> = {
  // Waiting on somebody.
  pending: s.pillPending,
  exclusive: s.pillPending,
  // Live, or finished well.
  open: s.pillApproved,
  approved: s.pillApproved,
  converted: s.pillApproved,
  completed: s.pillApproved,
  paid: s.pillApproved,
  // Stopped.
  suspended: s.pillSuspended,
  withdrawn: s.pillSuspended,
  dismissed: s.pillSuspended,
  cancelled: s.pillSuspended,
};

/** A status as a coloured pill. Unknown statuses render plain, never blank. */
export function StatusPill({ status }: { status: string }) {
  return <span className={`${s.pill} ${TONE[status] ?? ''}`}>{status}</span>;
}

/** The grid metric tiles sit in. */
export function Tiles({ children }: { children: React.ReactNode }) {
  return <div className={s.metricGrid}>{children}</div>;
}

/**
 * One number and what it means.
 *
 * `warn` is for a figure that is bad when it is non-zero — failures, stuck
 * sends — so the page does not have to remember which colour means trouble.
 */
export function Tile({
  value,
  label,
  hint,
  warn = false,
}: {
  value: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={s.metric}>
      <div className={s.metricValue} style={warn ? { color: 'var(--error)' } : undefined}>
        {value}
      </div>
      <div className={s.metricLabel}>{label}</div>
      {hint ? <div className={s.metricHint}>{hint}</div> : null}
    </div>
  );
}

/**
 * A table that scrolls sideways instead of stretching the page.
 *
 * The wrapper is the point: sixteen files repeated `tableWrap` around `table`,
 * and the one that forgets it pushes the whole admin off a laptop screen.
 * Headings are passed rather than written, so a column count cannot drift
 * from its header row.
 */
export function AdminTable({
  head,
  children,
}: {
  /** Omitted for the handful of tables that are really labelled rows. */
  head?: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        {head ? (
          <thead>
            <tr>
              {head.map((h, i) => (
                // Headings are static per table; index is stable here.
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * "9m ago", "3h ago", "17 Sept" — how long since something happened.
 *
 * Existed twice, in errors and crons, and disagreed: one said "0m ago" for
 * something that had just happened, the other "just now". The kinder answer
 * wins, and `absent` lets a page say "never" where that reads better than a
 * dash.
 */
export function ago(iso: string | null, absent = '—'): string {
  if (!iso) return absent;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
