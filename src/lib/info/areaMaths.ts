/**
 * The sums behind /info/area-map: the area inside a traced outline, the
 * length round it, and the length of an open line (a hedge, a fence run).
 * Area and the self-crossing check come from the job boundary geometry, so
 * the Info map and the enquiry map can never measure the same field two ways.
 */
import { ringAreaSqM, ringIsSimple, type LngLat } from '@/lib/jobParse/geometry';
import { ACRES_PER_HA, M2_PER_HA } from './sprayMaths';

export type { LngLat };

const EARTH_RADIUS_M = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function distanceM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length along the points in order; `closed` adds the edge back to the start. */
export function pathLengthM(points: LngLat[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  if (closed && points.length >= 3) total += distanceM(points[points.length - 1], points[0]);
  return total;
}

export type AreaMeasure =
  | { kind: 'none' }
  /** The outline crosses itself, so there is no honest area to give. */
  | { kind: 'crossed'; perimeterM: number }
  | { kind: 'area'; m2: number; ha: number; acres: number; perimeterM: number };

export function measureArea(points: LngLat[]): AreaMeasure {
  if (points.length < 3) return { kind: 'none' };
  const perimeterM = pathLengthM(points, true);
  if (!ringIsSimple(points)) return { kind: 'crossed', perimeterM };
  const m2 = ringAreaSqM(points);
  const ha = m2 / M2_PER_HA;
  return { kind: 'area', m2, ha, acres: ha * ACRES_PER_HA, perimeterM };
}

/**
 * When walking the edge with the phone's GPS, a new point is kept only once
 * the walker has moved this far from the last one and the fix is at least
 * this good. Closer than that, GPS wander draws a zigzag that adds length
 * and, on a small paddock, crosses itself.
 */
export const WALK_STEP_M = 4;
export const WALK_MAX_ACCURACY_M = 15;

export function keepWalkPoint(last: LngLat | undefined, next: LngLat, accuracyM: number): boolean {
  if (!(accuracyM <= WALK_MAX_ACCURACY_M)) return false;
  return !last || distanceM(last, next) >= WALK_STEP_M;
}

/** The figure handed to the calculators in `?acres=`, to two decimals. */
export function acresParam(acres: number): string {
  return String(Number(acres.toFixed(2)));
}

/** Read `?acres=` back: a positive number under 100,000, or null. */
export function parseAcresParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}
