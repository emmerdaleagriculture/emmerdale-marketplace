import Image from 'next/image';
import Link from 'next/link';
import { COVERAGE_BINS, UK_COUNTY_NAMES } from '@/lib/coverage';
import type { CountyRef } from '@/lib/verticals';
import s from './home.module.css';

/** Native size of the choropleth's viewBox — fixes the aspect ratio, no CLS. */
const MAP_W = 730;
const MAP_H = 1357;

/**
 * "Where we work" — the coverage choropleth on the front page, with the public
 * labels (no per-county contractor numbers) and every covered county linked to
 * its paddock page.
 *
 * The map itself is the /coverage-map.svg route rather than inline SVG: the
 * path data is far too heavy to sit in the landing page's HTML. Unoptimized
 * because it is already an SVG, and lazy because it sits below the fold.
 */
export function CoverageSection({
  coverage,
  counties,
}: {
  coverage: Record<string, number>;
  /** All counties with a landing page — used to link the covered ones. */
  counties: CountyRef[];
}) {
  // Counted off the map's own county list, so the heading and the map agree.
  const coveredCount = UK_COUNTY_NAMES.filter((n) => (coverage[n] ?? 0) > 0).length;
  const linked = counties
    .filter((c) => (coverage[c.name] ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section id="coverage" className={s.coverage}>
      <div className={`${s.container} ${s.coverageGrid}`}>
        <div>
          <p className={s.eyebrow}>Where we work</p>
          <h2 className={s.sectionH}>
            Approved operators in {coveredCount} of {UK_COUNTY_NAMES.length} counties.
          </h2>
          <p className={s.coverageCopy}>
            We cover England, Wales and Scotland, and the map fills in as more
            operators join. If your county is still pale, send the job anyway —
            demand is exactly how we get an operator into a new area.
          </p>
          <ul className={s.coverageLegend}>
            {COVERAGE_BINS.map((b) => (
              <li key={b.publicLabel}>
                <span className={s.coverageSwatch} style={{ background: b.fill }} />
                {b.publicLabel}
              </li>
            ))}
          </ul>
          {linked.length > 0 && (
            <details className={s.coverageList}>
              <summary>Counties we cover</summary>
              <ul>
                {linked.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/paddock-maintenance/${c.slug}`}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <Image
          src="/coverage-map.svg"
          alt={`Map of Great Britain shaded by contractor coverage: ${coveredCount} of ${UK_COUNTY_NAMES.length} counties covered`}
          width={MAP_W}
          height={MAP_H}
          unoptimized
          className={s.coverageMap}
        />
      </div>
    </section>
  );
}
