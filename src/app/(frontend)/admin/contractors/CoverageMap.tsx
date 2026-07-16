import { UK_COUNTY_PATHS, UK_MAP_VIEWBOX } from '@/lib/ukCountyPaths';
import s from '../admin.module.css';

/**
 * Choropleth of England + Wales: counties shaded by how many approved
 * contractors cover them. Pure server-rendered SVG — no client JS.
 */

// Sequential brand-green ramp (validated): neutral for zero, light → dark.
const BINS = [
  { min: 4, fill: '#245018', label: '4+ contractors' },
  { min: 2, fill: '#5f9844', label: '2–3 contractors' },
  { min: 1, fill: '#a5c887', label: '1 contractor' },
  { min: 0, fill: '#eceee9', label: 'No coverage' },
] as const;

const fillFor = (n: number) => BINS.find((b) => n >= b.min)!.fill;

export function CoverageMap({ counts }: { counts: Map<string, number> }) {
  const names = Object.keys(UK_COUNTY_PATHS);
  const covered = names.filter((n) => (counts.get(n) ?? 0) > 0);

  return (
    <div className={s.mapCard}>
      <div className={s.mapHead}>
        <span className={s.mapTitle}>Coverage</span>
        <span className={s.mapStat}>
          {covered.length} of {names.length} counties covered by an approved contractor
        </span>
      </div>
      <div className={s.mapRow}>
        <svg
          viewBox={UK_MAP_VIEWBOX}
          className={s.map}
          role="img"
          aria-label={`Map of England and Wales showing contractor coverage: ${covered.length} of ${names.length} counties covered`}
        >
          {names.map((name) => {
            const n = counts.get(name) ?? 0;
            return (
              <path key={name} d={UK_COUNTY_PATHS[name]} fill={fillFor(n)} className={s.mapCounty}>
                <title>{`${name} — ${n === 0 ? 'no coverage' : `${n} contractor${n === 1 ? '' : 's'}`}`}</title>
              </path>
            );
          })}
        </svg>
        <div className={s.mapLegend}>
          {BINS.map((b) => (
            <div key={b.label} className={s.mapLegendRow}>
              <span className={s.mapSwatch} style={{ background: b.fill }} />
              {b.label}
            </div>
          ))}
          <details className={s.mapList}>
            <summary>Covered counties</summary>
            <ul>
              {covered
                .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
                .map((n) => (
                  <li key={n}>
                    {n} · {counts.get(n)}
                  </li>
                ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
