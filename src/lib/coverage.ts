import { UK_COUNTY_PATHS } from '@/lib/ukCountyPaths';

/**
 * The coverage choropleth's data layer: which counties exist, how each is
 * shaded, and what its tooltip says. Kept apart from <UKCoverageMap> so the
 * standalone /coverage-map.svg route can build the same picture as a string —
 * a route handler can't import react-dom/server.
 */

// Sequential brand-green ramp: neutral for zero, light → dark.
// `label` is for the admin; `publicLabel` keeps contractor counts private.
export const COVERAGE_BINS = [
  { min: 10, fill: '#245018', label: '10+ contractors', publicLabel: 'Excellent coverage' },
  { min: 6, fill: '#4f8638', label: '6–9 contractors', publicLabel: 'Strong coverage' },
  { min: 4, fill: '#86b267', label: '4–5 contractors', publicLabel: 'Good coverage' },
  { min: 1, fill: '#c3dcad', label: '1–3 contractors', publicLabel: 'Covered' },
  { min: 0, fill: '#eceee9', label: 'No coverage yet', publicLabel: 'Not covered yet' },
] as const;

export const coverageFill = (n: number) => COVERAGE_BINS.find((b) => n >= b.min)!.fill;

export const UK_COUNTY_NAMES = Object.keys(UK_COUNTY_PATHS);

/**
 * The counties as drawable shapes: path, fill and tooltip for each.
 *
 * `unit` exists because the admin map now also plots job counts, and a
 * tooltip reading "Devon — 7 contractors" over a job count is simply wrong.
 * It defaults to contractors, so every existing caller — the public map
 * included — is unchanged.
 */
export function coverageShapes(
  counts: Record<string, number>,
  showCounts = false,
  unit: { one: string; many: string; none: string } = {
    one: 'contractor', many: 'contractors', none: 'no coverage yet',
  },
) {
  return UK_COUNTY_NAMES.map((name) => {
    const n = counts[name] ?? 0;
    return {
      name,
      d: UK_COUNTY_PATHS[name],
      fill: coverageFill(n),
      /** Admin only — public pages must not reveal per-county contractor numbers. */
      title: showCounts
        ? `${name} — ${n === 0 ? unit.none : `${n} ${n === 1 ? unit.one : unit.many}`}`
        : `${name} — ${n === 0 ? 'not covered yet' : 'covered'}`,
    };
  });
}

/**
 * The bins the map actually uses. A legend row for a shade that appears
 * nowhere on the map — "Not covered yet" once every county is covered — sends
 * the reader hunting for something that isn't there.
 */
export function coverageBinsInUse(counts: Record<string, number>) {
  const fills = new Set(UK_COUNTY_NAMES.map((n) => coverageFill(counts[n] ?? 0)));
  return COVERAGE_BINS.filter((b) => fills.has(b.fill));
}

/** Alt/aria text for the whole map. */
export function coverageMapLabel(counts: Record<string, number>, what = 'contractor coverage') {
  const covered = UK_COUNTY_NAMES.filter((n) => (counts[n] ?? 0) > 0).length;
  return `Map of Great Britain showing ${what}: ${covered} of ${UK_COUNTY_NAMES.length} counties covered`;
}
