import s from './admin.module.css';

/**
 * A donut: one part-to-whole split, with the total in the middle and every
 * slice named in a legend beside it.
 *
 * Server-rendered SVG, no library. Slices keep their colour by position in
 * the list the caller passes, so "Priced" is the same green on every visit
 * regardless of which slices are zero that day. Hues come from a categorical
 * palette validated for colour-vision deficiency on a white surface; three of
 * them fall short of 3:1 against white, which is why the legend always
 * carries the label and value — the colour is never the only cue. A 2px
 * white gap separates neighbouring slices, and each arc carries a <title>
 * so hovering names it.
 *
 * Empty (every value zero) renders the ring in the rule colour with the
 * caller's `empty` text, so a quiet section still reads as a chart and not a
 * hole in the page.
 */

export type PieSlice = { label: string; value: number; hint?: string };

/** A section's donut, in its own card under the section's tiles or list. */
export function PieCard({ title, ...pie }: { title: string } & Parameters<typeof Pie>[0]) {
  return (
    <div className={s.pieCard}>
      <div className={s.pieCardTitle}>{title}</div>
      <Pie {...pie} />
    </div>
  );
}

/**
 * A table that folds away under one line. Closed by default: the donut
 * above it says the shape, the table is for the row you came for.
 */
export function Fold({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className={s.fold}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

const HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const R = 44;
const STROKE = 14;
const C = 2 * Math.PI * R;
/** The surface gap between slices, in ring circumference units. */
const GAP = 2;

export function Pie({
  slices,
  total,
  format = (v) => v.toLocaleString('en-GB'),
  centre,
  empty = 'Nothing yet',
}: {
  slices: PieSlice[];
  /** Shown in the middle. Defaults to the sum of the slices. */
  total?: string;
  format?: (v: number) => string;
  /** What the middle number is: "jobs", "invitations". */
  centre?: string;
  empty?: string;
}) {
  const sum = slices.reduce((a, b) => a + Math.max(0, b.value), 0);
  const shown = slices.filter((sl) => sl.value > 0);
  let offset = 0;
  const arcs = slices.map((sl, i) => {
    const v = Math.max(0, sl.value);
    const len = sum > 0 ? (C * v) / sum : 0;
    const arc = { i, sl, len, offset, colour: HUES[i % HUES.length] };
    offset += len;
    return arc;
  });

  return (
    <div className={s.pie}>
      <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`${total ?? format(sum)} ${centre ?? ''}`.trim()}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--rule)" strokeWidth={STROKE} />
        {sum > 0 &&
          arcs
            .filter((a) => a.len > 0)
            .map((a) => {
              // Only one slice: a full ring, no gap to cut.
              const dash = shown.length === 1 ? C : Math.max(0, a.len - GAP);
              return (
                <circle
                  key={a.i}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={a.colour}
                  strokeWidth={STROKE}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-a.offset}
                  transform="rotate(-90 60 60)"
                >
                  <title>{`${a.sl.label}: ${format(a.sl.value)} (${Math.round((100 * a.sl.value) / sum)}%)`}</title>
                </circle>
              );
            })}
        <text x="60" y="58" textAnchor="middle" className={s.pieTotal}>
          {total ?? format(sum)}
        </text>
        {centre && (
          <text x="60" y="72" textAnchor="middle" className={s.pieCentre}>
            {centre}
          </text>
        )}
      </svg>
      <ul className={s.pieLegend}>
        {sum === 0 ? (
          <li className={s.metricHint}>{empty}</li>
        ) : (
          arcs
            .filter((a) => a.sl.value > 0)
            .map((a) => (
              <li key={a.i}>
                <span className={s.pieSwatch} style={{ background: a.colour }} aria-hidden="true" />
                <span className={s.pieLabel}>{a.sl.label}</span>
                <span className={s.pieValue}>
                  {format(a.sl.value)}
                  <small> {Math.round((100 * a.sl.value) / sum)}%</small>
                </span>
              </li>
            ))
        )}
      </ul>
    </div>
  );
}
