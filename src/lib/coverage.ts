import { UK_COUNTY_PATHS } from '@/lib/ukCountyPaths';

/**
 * The coverage choropleth's data layer: which counties exist, how each is
 * shaded, and what its tooltip says. Kept apart from <UKCoverageMap> so the
 * standalone /coverage-map.svg route can build the same picture as a string —
 * a route handler can't import react-dom/server.
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

/** The counties as drawable shapes: path, fill and tooltip for each. */
export function coverageShapes(counts: Record<string, number>, showCounts = false) {
  return UK_COUNTY_NAMES.map((name) => {
    const n = counts[name] ?? 0;
    return {
      name,
      d: UK_COUNTY_PATHS[name],
      fill: coverageFill(n),
      /** Admin only — public pages must not reveal per-county contractor numbers. */
      title: showCounts
        ? `${name} — ${n === 0 ? 'no coverage yet' : `${n} contractor${n === 1 ? '' : 's'}`}`
        : `${name} — ${n === 0 ? 'not covered yet' : 'covered'}`,
    };
  });
}

/** Alt/aria text for the whole map. */
export function coverageMapLabel(counts: Record<string, number>) {
  const covered = UK_COUNTY_NAMES.filter((n) => (counts[n] ?? 0) > 0).length;
  return `Map of Great Britain showing contractor coverage: ${covered} of ${UK_COUNTY_NAMES.length} counties covered`;
}
