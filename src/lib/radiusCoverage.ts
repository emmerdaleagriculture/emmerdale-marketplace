import { UK_COUNTY_PATHS } from '@/lib/ukCountyPaths';

/**
 * How much of Great Britain's land lies within a radius of any contractor.
 *
 * The county outlines in ukCountyPaths are the only land geometry the app
 * carries, and they are drawn in SVG space, not lat/lng. Their generator is
 * not in the repo, so the projection was recovered by fitting: a plain
 * spherical Mercator with the constants below. Checked against 27 towns of
 * known county (25 land in the right one; the other two sit within half a
 * mile of the generalised coastline or on a London boundary) and against
 * contractor base postcodes (110 of 113 on land; two a few hundred metres
 * offshore, one in Northern Ireland, which the map does not include).
 *
 * Land is sampled on a ~2 mile lat/lng grid, weighted by cos(latitude) so a
 * Shetland cell counts for less than a Cornish one. Good to about a
 * percentage point — this is a planning picture, not a survey.
 */

const K = 3952.9142195600643;
const TX = 435.8751170350811;
const TY = 4657.174485721973;

const LAT_MIN = 49.8;
const LAT_MAX = 60.9;
const LNG_MIN = -8.7;
const LNG_MAX = 1.9;
const LAT_STEP = 0.03; // ≈ 2.1 miles
const LNG_STEP = 0.05; // ≈ 2 miles at 55°N

const EARTH_RADIUS_MILES = 3958.8;
const DEG = Math.PI / 180;

type Ring = [number, number][];
type Shape = { name: string; rings: Ring[]; bbox: [number, number, number, number] };
type LandCell = { lat: number; lng: number; weight: number; county: string };

function project(lat: number, lng: number): [number, number] {
  return [TX + K * lng * DEG, TY - K * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2))];
}

function parseShapes(): Shape[] {
  return Object.entries(UK_COUNTY_PATHS).map(([name, d]) => {
    const rings: Ring[] = d
      .split('M')
      .filter(Boolean)
      .map((ring) =>
        ring
          .replace(/Z/g, '')
          .split('L')
          .map((p) => p.split(',').map(Number) as [number, number]),
      );
    const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) {
      for (const [x, y] of ring) {
        bbox[0] = Math.min(bbox[0], x);
        bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x);
        bbox[3] = Math.max(bbox[3], y);
      }
    }
    return { name, rings, bbox };
  });
}

/** Even-odd rule across every ring, so islands and holes both work. */
function inside(x: number, y: number, rings: Ring[]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

let landCache: LandCell[] | null = null;

/** The land grid, built once per server process (~20k cells). */
function landCells(): LandCell[] {
  if (landCache) return landCache;
  const shapes = parseShapes();
  const cells: LandCell[] = [];
  for (let lat = LAT_MIN + LAT_STEP / 2; lat < LAT_MAX; lat += LAT_STEP) {
    const weight = Math.cos(lat * DEG);
    for (let lng = LNG_MIN + LNG_STEP / 2; lng < LNG_MAX; lng += LNG_STEP) {
      const [x, y] = project(lat, lng);
      for (const shape of shapes) {
        const [x0, y0, x1, y1] = shape.bbox;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (inside(x, y, shape.rings)) {
          cells.push({ lat, lng, weight, county: shape.name });
          break;
        }
      }
    }
  }
  landCache = cells;
  return cells;
}

function withinMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  miles: number,
): boolean {
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a)) <= miles;
}

const COUNTRY_ORDER = ['England', 'Wales', 'Scotland'];

export type RadiusCoverage = {
  radius: number;
  /** Percent of Great Britain's land within `radius` miles of a contractor. */
  overall: number;
  byCountry: { country: string; pct: number }[];
};

export function landCoverage(
  points: { lat: number; lng: number }[],
  radiusMiles: number,
  countryOf: Record<string, string>,
): RadiusCoverage {
  // Degrees of latitude the radius spans — a cheap box test before haversine.
  const latPad = radiusMiles / 69;
  const totals: Record<string, { all: number; covered: number }> = {};
  let all = 0;
  let covered = 0;

  for (const cell of landCells()) {
    const country = countryOf[cell.county] ?? 'Other';
    const t = (totals[country] ??= { all: 0, covered: 0 });
    t.all += cell.weight;
    all += cell.weight;

    const lngPad = latPad / Math.max(Math.cos(cell.lat * DEG), 0.1);
    const reached = points.some(
      (p) =>
        Math.abs(p.lat - cell.lat) <= latPad &&
        Math.abs(p.lng - cell.lng) <= lngPad &&
        withinMiles(cell.lat, cell.lng, p.lat, p.lng, radiusMiles),
    );
    if (reached) {
      t.covered += cell.weight;
      covered += cell.weight;
    }
  }

  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
  return {
    radius: radiusMiles,
    overall: pct(covered, all),
    byCountry: COUNTRY_ORDER.filter((cn) => totals[cn]).map((cn) => ({
      country: cn,
      pct: pct(totals[cn].covered, totals[cn].all),
    })),
  };
}
