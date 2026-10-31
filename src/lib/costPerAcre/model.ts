import { countySlug } from '@/lib/slug';
import { MAP_GREENS, MAP_NEUTRAL } from '@/lib/mapPalette';

/**
 * The cost-per-acre snapshot as the page reads it: pure shaping and
 * formatting, no server imports, so the client explorer can use it too.
 * The figures are built in the database by sq_cost_per_acre_refresh()
 * (migration 20261031120000); this file only arranges them.
 */

export type RateScope = 'uk' | 'region' | 'county';

/** One snapshot row: a service, in a place, across some jobs. Money in pence. */
export type Rate = {
  scope: RateScope;
  region: string | null;
  county: string | null;
  serviceId: number;
  service: string;
  jobs: number;
  quotes: number;
  acres: number;
  avg: number;
  median: number;
  low: number;
  high: number;
};

export type CostSnapshot = {
  /** When the snapshot was taken; null when the table is empty. */
  computedAt: string | null;
  /** Oldest job in the snapshot. */
  since: string | null;
  uk: Rate[];
  regions: Rate[];
  counties: Rate[];
};

export const EMPTY_SNAPSHOT: CostSnapshot = { computedAt: null, since: null, uk: [], regions: [], counties: [] };

/** Pence to whole pounds: "£161". The figures are averages, so pennies are noise. */
export function pounds(pence: number): string {
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

/** "£63 to £328", or the one figure when low and high agree (a one-job place). */
export function range(r: Pick<Rate, 'low' | 'high'>): string {
  const lo = Math.round(r.low / 100);
  const hi = Math.round(r.high / 100);
  return lo === hi ? pounds(r.low) : `${pounds(r.low)} to ${pounds(r.high)}`;
}

/** "October 2026" for the "updated" line. */
export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

/** "25 September 2026" for the "since" line. */
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

/**
 * The services the explorer offers, busiest first: the one with the most
 * priced jobs is the default pick, since it has the most counties coloured.
 */
export function servicesByJobs(snapshot: CostSnapshot): Rate[] {
  return [...snapshot.uk].sort((x, y) => y.jobs - x.jobs || x.service.localeCompare(y.service));
}

/** Average £/acre per county for one service, keyed by county name. */
export function countyAverages(snapshot: CostSnapshot, serviceId: number): Record<string, Rate> {
  const out: Record<string, Rate> = {};
  for (const r of snapshot.counties) {
    if (r.serviceId === serviceId && r.county) out[r.county] = r;
  }
  return out;
}

/** Every service priced in a county, busiest first. */
export function countyRates(snapshot: CostSnapshot, county: string): Rate[] {
  return snapshot.counties
    .filter((r) => r.county === county)
    .sort((x, y) => y.jobs - x.jobs || x.service.localeCompare(y.service));
}

/** Every service priced in a region, busiest first. */
export function regionRates(snapshot: CostSnapshot, region: string): Rate[] {
  return snapshot.regions
    .filter((r) => r.region === region)
    .sort((x, y) => y.jobs - x.jobs || x.service.localeCompare(y.service));
}

/** The regions with at least one figure, alphabetical. */
export function regionsWithData(snapshot: CostSnapshot): string[] {
  return [...new Set(snapshot.regions.map((r) => r.region).filter((r): r is string => Boolean(r)))].sort();
}

/** The counties with at least one figure, alphabetical. */
export function countiesWithData(snapshot: CostSnapshot): string[] {
  return [...new Set(snapshot.counties.map((r) => r.county).filter((c): c is string => Boolean(c)))].sort();
}

/** Total priced jobs and prices across the snapshot (the UK rows, one per service). */
export function totals(snapshot: CostSnapshot): { jobs: number; quotes: number; counties: number } {
  return {
    jobs: snapshot.uk.reduce((n, r) => n + r.jobs, 0),
    quotes: snapshot.uk.reduce((n, r) => n + r.quotes, 0),
    counties: countiesWithData(snapshot).length,
  };
}

/**
 * The map's shading: fixed pound bands so a county reads the same whichever
 * service is picked, and so "£350 to £599" means the same on every visit.
 * Brand-green ramp, neutral for no figure, as the coverage map.
 */
export const RATE_BINS = [
  { min: 60000, fill: MAP_GREENS[4], label: '£600+ an acre' },
  { min: 35000, fill: MAP_GREENS[3], label: '£350 to £599' },
  { min: 20000, fill: MAP_GREENS[2], label: '£200 to £349' },
  { min: 10000, fill: MAP_GREENS[1], label: '£100 to £199' },
  { min: 0, fill: MAP_GREENS[0], label: 'Under £100' },
] as const;

export const NO_DATA_FILL = MAP_NEUTRAL;

export function rateFill(avgPence: number | undefined): string {
  if (avgPence === undefined) return NO_DATA_FILL;
  return RATE_BINS.find((b) => avgPence >= b.min)!.fill;
}

/** The bins a set of county averages actually uses, for the legend. */
export function rateBinsInUse(byCounty: Record<string, Rate>) {
  const fills = new Set(Object.values(byCounty).map((r) => rateFill(r.avg)));
  return RATE_BINS.filter((b) => fills.has(b.fill));
}

/** A CSS custom property name for a county's fill: "--c-east-riding-of-yorkshire". */
export function countyVar(name: string): string {
  return `--c-${countySlug(name)}`;
}

/** The stroke of the chosen county on the map. */
export const SELECTED_STROKE = '#ffde00';

/**
 * The CSS variables that colour the map: a fill per county with a figure
 * for the chosen service, and a stroke for the chosen county. The page sets
 * these on the map wrapper for the first paint; the explorer sets the same
 * on every change. Counties absent from the result keep the path's own
 * neutral default.
 */
export function mapVars(byCounty: Record<string, Rate>, selected: string | null): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, r] of Object.entries(byCounty)) vars[countyVar(name)] = rateFill(r.avg);
  if (selected) {
    vars[`${countyVar(selected)}-s`] = SELECTED_STROKE;
    vars[`${countyVar(selected)}-w`] = '2.5';
  }
  return vars;
}
