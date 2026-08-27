/**
 * Boundary polygon geometry (spec §7). Pure functions, no map library —
 * Leaflet owns the drawing UI; everything that must be *right* (area, shape
 * validation) lives here where it can be unit-tested.
 */

export type LngLat = [number, number]; // GeoJSON order: [lng, lat]

export type BoundaryPolygon = {
  type: 'Polygon';
  coordinates: [LngLat[]]; // single ring, first point repeated last
};

const EARTH_RADIUS_M = 6371000;
const SQ_M_PER_ACRE = 4046.86;
const MAX_VERTICES = 100;

/**
 * Planar shoelace area on an equirectangular projection centred on the
 * polygon — accurate to well under 0.1% at field scale (a few hundred metres),
 * which is far inside the ±10% tolerance band the price holds to.
 * Ring may be open or closed; returns square metres.
 */
export function ringAreaSqM(ring: LngLat[]): number {
  const pts = closeRing(ring);
  if (pts.length < 4) return 0; // closed triangle = 4 points

  const lat0 = (pts.reduce((s, p) => s + p[1], 0) / pts.length) * (Math.PI / 180);
  const cos = Math.cos(lat0);
  const toXY = ([lng, lat]: LngLat): [number, number] => [
    EARTH_RADIUS_M * (lng * Math.PI) / 180 * cos,
    EARTH_RADIUS_M * (lat * Math.PI) / 180,
  ];

  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = toXY(pts[i]);
    const [x2, y2] = toXY(pts[i + 1]);
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

export function ringAreaAcres(ring: LngLat[]): number {
  return ringAreaSqM(ring) / SQ_M_PER_ACRE;
}

function closeRing(ring: LngLat[]): LngLat[] {
  if (ring.length < 3) return ring;
  const [fLng, fLat] = ring[0];
  const [lLng, lLat] = ring[ring.length - 1];
  return fLng === lLng && fLat === lLat ? ring : [...ring, ring[0]];
}

/**
 * Validate a client-supplied boundary: GeoJSON Polygon, one ring, sane vertex
 * count, coordinates on Earth (and loosely within the British Isles — a
 * polygon in the Pacific is garbage in, and this is dispute evidence).
 * Returns the normalised closed polygon, or null.
 */
export function parseBoundary(raw: unknown): BoundaryPolygon | null {
  let value = raw;
  if (typeof value === 'string') {
    if (value.length > 20000) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  const poly = value as { type?: unknown; coordinates?: unknown };
  if (poly.type !== 'Polygon' || !Array.isArray(poly.coordinates)) return null;
  if (poly.coordinates.length !== 1) return null;
  const ring = poly.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3 || ring.length > MAX_VERTICES) return null;

  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length !== 2) return null;
    const [lng, lat] = pt;
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -11 || lng > 2.5 || lat < 49 || lat > 61.5) return null; // British Isles bbox
  }
  return { type: 'Polygon', coordinates: [closeRing(ring as LngLat[])] };
}

/**
 * Stated vs mapped discrepancy (§7): flag when they differ by more than the
 * threshold (default 20%, relative to the measured figure). Non-blocking.
 */
export function areaDiscrepancy(
  statedAcres: number | null,
  mappedAcres: number | null,
  thresholdPct = Number(process.env.NEXT_PUBLIC_AREA_DISCREPANCY_PCT || 20),
): boolean {
  if (statedAcres === null || mappedAcres === null || mappedAcres <= 0) return false;
  return Math.abs(statedAcres - mappedAcres) / mappedAcres > thresholdPct / 100;
}
