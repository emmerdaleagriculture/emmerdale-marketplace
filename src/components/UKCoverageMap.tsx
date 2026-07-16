import { UK_COUNTY_PATHS, UK_MAP_VIEWBOX } from '@/lib/ukCountyPaths';

/**
 * England + Wales choropleth: counties shaded by how many approved contractors
 * cover them. Pure server-rendered SVG — shared by the admin contractors page
 * and the public landing page.
 */

// Sequential brand-green ramp (validated): neutral for zero, light → dark.
// `label` is for the admin; `publicLabel` keeps contractor counts private.
export const COVERAGE_BINS = [
  { min: 4, fill: '#245018', label: '4+ contractors', publicLabel: 'Strong coverage' },
  { min: 2, fill: '#5f9844', label: '2–3 contractors', publicLabel: 'Good coverage' },
  { min: 1, fill: '#a5c887', label: '1 contractor', publicLabel: 'Covered' },
  { min: 0, fill: '#eceee9', label: 'No coverage yet', publicLabel: 'Not covered yet' },
] as const;

export const coverageFill = (n: number) => COVERAGE_BINS.find((b) => n >= b.min)!.fill;

export const UK_COUNTY_NAMES = Object.keys(UK_COUNTY_PATHS);

export function UKCoverageMap({
  counts,
  className,
  pathClassName,
  showCounts = false,
}: {
  counts: Record<string, number>;
  className?: string;
  pathClassName?: string;
  /** Admin only — public pages must not reveal per-county contractor numbers. */
  showCounts?: boolean;
}) {
  const covered = UK_COUNTY_NAMES.filter((n) => (counts[n] ?? 0) > 0).length;
  return (
    <svg
      viewBox={UK_MAP_VIEWBOX}
      className={className}
      role="img"
      aria-label={`Map of England and Wales showing contractor coverage: ${covered} of ${UK_COUNTY_NAMES.length} counties covered`}
    >
      {UK_COUNTY_NAMES.map((name) => {
        const n = counts[name] ?? 0;
        return (
          <path
            key={name}
            d={UK_COUNTY_PATHS[name]}
            fill={coverageFill(n)}
            stroke="#fff"
            strokeWidth={1}
            className={pathClassName}
          >
            <title>
              {showCounts
                ? `${name} — ${n === 0 ? 'no coverage yet' : `${n} contractor${n === 1 ? '' : 's'}`}`
                : `${name} — ${n === 0 ? 'not covered yet' : 'covered'}`}
            </title>
          </path>
        );
      })}
    </svg>
  );
}
