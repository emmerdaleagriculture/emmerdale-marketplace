import {
  UKCoverageMap,
  COVERAGE_BINS,
  UK_COUNTY_NAMES,
} from '@/components/UKCoverageMap';
import s from '../admin.module.css';

/** Admin coverage card: the shared choropleth plus legend and county list. */
export function CoverageMap({ counts }: { counts: Record<string, number> }) {
  const covered = UK_COUNTY_NAMES.filter((n) => (counts[n] ?? 0) > 0);

  return (
    <div className={s.mapCard}>
      <div className={s.mapHead}>
        <span className={s.mapTitle}>Coverage</span>
        <span className={s.mapStat}>
          {covered.length} of {UK_COUNTY_NAMES.length} counties covered by an approved contractor
        </span>
      </div>
      <div className={s.mapRow}>
        <UKCoverageMap counts={counts} className={s.map} pathClassName={s.mapCounty} />
        <div className={s.mapLegend}>
          {COVERAGE_BINS.map((b) => (
            <div key={b.label} className={s.mapLegendRow}>
              <span className={s.mapSwatch} style={{ background: b.fill }} />
              {b.label}
            </div>
          ))}
          <details className={s.mapList}>
            <summary>Covered counties</summary>
            <ul>
              {covered
                .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b))
                .map((n) => (
                  <li key={n}>
                    {n} · {counts[n]}
                  </li>
                ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
