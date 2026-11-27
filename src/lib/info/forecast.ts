import { normalisePostcode } from '@/lib/postcodes';

/**
 * The forecast behind /info/work-windows.
 *
 * Source: MET Norway's Locationforecast 2.0 (api.met.no), which covers the
 * whole world, is free for commercial use under CC BY 4.0 and asks only for
 * a credit on the page and a User-Agent that says who is calling
 * (INFO_WEATHER_UA, see .env.local.example). For a UK point it gives 60 hours hour
 * by hour, then six-hour steps out to about nine days. It has no gusts and
 * no soil temperature outside the Nordic area, and the page says so rather
 * than inventing them.
 *
 * Fetches are cached for half an hour per ~1 km square (two decimal places),
 * so a busy postcode costs one call, and MET Norway's own updates are hourly.
 */

export type Slot = {
  /** Start of the slot, ISO UTC. */
  t: string;
  /** Length in hours: 1 in the detailed part, 6 in the outlook. */
  hours: 1 | 6;
  tempC: number;
  /** Mean wind at 10 m, metres a second. */
  windMs: number;
  humidity: number;
  dewPointC: number;
  /** Rain over the slot, millimetres. */
  rainMm: number;
};

export type Place = { lat: number; lng: number; label: string };

type MetSeries = {
  time: string;
  data: {
    instant: { details: Record<string, number | undefined> };
    next_1_hours?: { details?: { precipitation_amount?: number } };
    next_6_hours?: { details?: { precipitation_amount?: number } };
  };
};

const UA = process.env.INFO_WEATHER_UA || 'field-work-windows/1.0';

/** MET Norway's series as slots; entries missing a reading are dropped. */
export function slotsFromMet(series: MetSeries[]): Slot[] {
  const out: Slot[] = [];
  for (const s of series) {
    const d = s.data.instant.details;
    const one = s.data.next_1_hours?.details?.precipitation_amount;
    const six = s.data.next_6_hours?.details?.precipitation_amount;
    const hours = one !== undefined ? 1 : six !== undefined ? 6 : null;
    if (hours === null || d.air_temperature === undefined || d.wind_speed === undefined) continue;
    out.push({
      t: s.time,
      hours,
      tempC: d.air_temperature,
      windMs: d.wind_speed,
      humidity: d.relative_humidity ?? 0,
      dewPointC: d.dew_point_temperature ?? d.air_temperature - 5,
      rainMm: (hours === 1 ? one : six) ?? 0,
    });
  }
  return out;
}

export async function fetchSlots(lat: number, lng: number): Promise<Slot[] | null> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { properties?: { timeseries?: MetSeries[] } };
    const slots = slotsFromMet(j.properties?.timeseries ?? []);
    return slots.length ? slots : null;
  } catch {
    return null;
  }
}

/** Roughly the British Isles: a position outside it is not worth a lookup. */
export function inBritishIsles(lat: number, lng: number): boolean {
  return lat >= 49 && lat <= 61.5 && lng >= -11 && lng <= 2.5;
}

/**
 * Where the person means: "50.95,-1.42" from the phone's position, or a UK
 * postcode or its first half. Null when it is neither or not found.
 */
export async function resolvePlace(raw: string): Promise<Place | null> {
  const q = raw.trim();
  const m = q.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,2}(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return inBritishIsles(lat, lng) ? { lat, lng, label: 'your position' } : null;
  }
  const norm = normalisePostcode(q);
  const path = norm.full ? `postcodes/${encodeURIComponent(norm.full)}` : norm.outcode ? `outcodes/${encodeURIComponent(norm.outcode)}` : null;
  if (!path) return null;
  try {
    const r = await fetch(`https://api.postcodes.io/${path}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { latitude?: number | null; longitude?: number | null } | null };
    const lat = j.result?.latitude;
    const lng = j.result?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    // Only ever the first half on the page: a full postcode can be one house.
    return { lat, lng, label: norm.outcode ?? q.toUpperCase() };
  } catch {
    return null;
  }
}
