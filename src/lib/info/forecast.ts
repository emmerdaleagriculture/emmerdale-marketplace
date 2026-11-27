import { normalisePostcode } from '@/lib/postcodes';

/**
 * The forecast behind /info/work-windows.
 *
 * Two sources. With OPEN_METEO_API_KEY set (the user chose Open-Meteo's
 * paid plan on 2026-11-27; its free API bars commercial sites) the forecast
 * is Open-Meteo's: seven days hour by hour, with gusts and soil temperature
 * at 6 cm, credited "Weather data by Open-Meteo.com" (CC BY 4.0). Without
 * the key it falls back to MET Norway, so the page works before the key is
 * in place and if the subscription ever lapses.
 *
 * MET Norway's Locationforecast 2.0 (api.met.no), which covers the
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
  /** Strongest gust in the slot at 10 m, metres a second. Open-Meteo only. */
  gustMs?: number;
  /** Soil temperature at 6 cm. Open-Meteo only. */
  soilC?: number;
};

export type ForecastSource = 'open-meteo' | 'met-norway';
export type Forecast = { slots: Slot[]; source: ForecastSource };

/** Which source a lookup will use: the page's method text depends on it. */
export function forecastSource(): ForecastSource {
  return process.env.OPEN_METEO_API_KEY ? 'open-meteo' : 'met-norway';
}

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

type OpenMeteoHourly = {
  time: number[];
  temperature_2m: (number | null)[];
  relative_humidity_2m: (number | null)[];
  dew_point_2m: (number | null)[];
  precipitation: (number | null)[];
  wind_speed_10m: (number | null)[];
  wind_gusts_10m?: (number | null)[];
  soil_temperature_6cm?: (number | null)[];
};

/**
 * Open-Meteo's hourly arrays as slots, from the hour that contains `now`.
 * Temperature and wind are readings at the hour; rain and gusts are totals
 * and peaks for the hour BEFORE their timestamp, so a slot starting at 9
 * takes its rain and gust from the 10 o'clock entries.
 */
export function slotsFromOpenMeteo(h: OpenMeteoHourly, now: number): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i + 1 < h.time.length; i++) {
    const start = h.time[i] * 1000;
    if (start + 3600000 <= now) continue;
    const tempC = h.temperature_2m[i];
    const windMs = h.wind_speed_10m[i];
    if (tempC === null || tempC === undefined || windMs === null || windMs === undefined) continue;
    const gust = h.wind_gusts_10m?.[i + 1];
    const soil = h.soil_temperature_6cm?.[i];
    out.push({
      t: new Date(start).toISOString(),
      hours: 1,
      tempC,
      windMs,
      humidity: h.relative_humidity_2m[i] ?? 0,
      dewPointC: h.dew_point_2m[i] ?? tempC - 5,
      rainMm: h.precipitation[i + 1] ?? 0,
      ...(typeof gust === 'number' ? { gustMs: gust } : {}),
      ...(typeof soil === 'number' ? { soilC: soil } : {}),
    });
  }
  return out;
}

const OPEN_METEO_VARS = 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m,wind_gusts_10m,soil_temperature_6cm';

async function fetchOpenMeteo(lat: number, lng: number, key: string): Promise<Slot[] | null> {
  // The paid endpoint; same syntax as the free one, plus the key.
  const url =
    `https://customer-api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}` +
    `&hourly=${OPEN_METEO_VARS}&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT&forecast_days=7&apikey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.error('[info] open-meteo answered', r.status);
      return null;
    }
    const j = (await r.json()) as { hourly?: OpenMeteoHourly };
    const slots = j.hourly ? slotsFromOpenMeteo(j.hourly, Date.now()) : [];
    return slots.length ? slots : null;
  } catch {
    return null;
  }
}

/** The forecast for a place: Open-Meteo when the key is set, MET Norway otherwise or if Open-Meteo fails. */
export async function fetchForecast(lat: number, lng: number): Promise<Forecast | null> {
  const key = process.env.OPEN_METEO_API_KEY;
  if (key) {
    const slots = await fetchOpenMeteo(lat, lng, key);
    if (slots) return { slots, source: 'open-meteo' };
  }
  const slots = await fetchSlots(lat, lng);
  return slots ? { slots, source: 'met-norway' } : null;
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
