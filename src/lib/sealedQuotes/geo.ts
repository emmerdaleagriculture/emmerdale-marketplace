/**
 * Display-only distance (spec §15: never a filter). TS twin of the SQL
 * haversine_miles(); tests pin both against known UK distances.
 */
const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
