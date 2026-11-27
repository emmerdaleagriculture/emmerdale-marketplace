import { ACRES_PER_HA } from './sprayMaths';

/**
 * Spray diary records (/info/spray-diary, table spray_records): reading the
 * form, and the CSV an inspector or an assurance scheme can be handed.
 * Client-safe: the form and the list import from here, so no Supabase and
 * nothing that pulls it in (which is why the postcode check is its own).
 */

export const DOSE_UNITS = ['L/ha', 'ml/ha', 'kg/ha', 'g/ha'] as const;
export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export type SprayRecord = {
  id: string;
  sprayed_on: string;
  start_time: string | null;
  end_time: string | null;
  site: string;
  postcode: string | null;
  customer: string | null;
  situation: string;
  area_ha: number;
  product: string;
  mapp: string | null;
  dose: number;
  dose_unit: string;
  water_l_ha: number | null;
  target: string | null;
  wind_mph: number | null;
  wind_direction: string | null;
  temp_c: number | null;
  conditions: string | null;
  operator: string;
  certificate: string | null;
  equipment: string | null;
  stock_out_until: string | null;
  notes: string | null;
};

export type SprayRecordInput = Omit<SprayRecord, 'id'>;

export const RECORD_COLUMNS =
  'id, sprayed_on, start_time, end_time, site, postcode, customer, situation, area_ha, product, mapp, dose, dose_unit, water_l_ha, target, wind_mph, wind_direction, temp_c, conditions, operator, certificate, equipment, stock_out_until, notes';

/** "so51 0hn" to "SO51 0HN", "so51" to "SO51"; null when it is neither. */
export function tidyPostcode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(c)) return `${c.slice(0, -3)} ${c.slice(-3)}`;
  return /^[A-Z]{1,2}[0-9][A-Z0-9]?$/.test(c) ? c : null;
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function text(fd: FormData, key: string, max: number): string | null | { error: string } {
  const v = String(fd.get(key) ?? '').trim();
  if (v.length > max) return { error: `“${key.replace(/_/g, ' ')}” is too long.` };
  return v || null;
}
function number(fd: FormData, key: string): number | null | 'bad' {
  const raw = String(fd.get(key) ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 'bad';
}

/** The form as a row, or the first thing wrong with it. `today` is the UK date. */
export function readSprayRecord(fd: FormData, today: string): SprayRecordInput | { error: string } {
  const sprayed_on = String(fd.get('sprayed_on') ?? '');
  if (!isDay(sprayed_on)) return { error: 'Pick the date you sprayed.' };
  if (sprayed_on > today) return { error: 'The date is in the future. Record a job once it is done.' };

  const times: Record<string, string | null> = {};
  for (const k of ['start_time', 'end_time']) {
    const v = String(fd.get(k) ?? '').trim().slice(0, 5);
    if (v && !isTime(v)) return { error: 'That time doesn’t look right.' };
    times[k] = v || null;
  }

  const texts: Record<string, string | null> = {};
  for (const [k, max] of [
    ['site', 200],
    ['customer', 200],
    ['situation', 200],
    ['product', 200],
    ['target', 300],
    ['conditions', 300],
    ['operator', 200],
    ['certificate', 100],
    ['equipment', 200],
    ['notes', 2000],
  ] as const) {
    const v = text(fd, k, max);
    if (v && typeof v === 'object') return v;
    texts[k] = v as string | null;
  }
  if (!texts.site) return { error: 'Say which field or site.' };
  if (!texts.situation) return { error: 'Say what was sprayed: grazing paddock, hay field, and so on.' };
  if (!texts.product) return { error: 'Name the product.' };
  if (!texts.operator) return { error: 'Name the operator.' };

  const mapp = String(fd.get('mapp') ?? '').replace(/\D/g, '');
  if (mapp && !/^\d{4,6}$/.test(mapp)) return { error: 'The MAPP number is the four or five digit number on the label.' };

  const rawPc = String(fd.get('postcode') ?? '').trim();
  const pc = rawPc ? tidyPostcode(rawPc) : null;
  if (rawPc && !pc) return { error: 'That postcode doesn’t look right.' };

  let area = number(fd, 'area');
  if (area === 'bad' || area === null || area <= 0) return { error: 'Give the area sprayed.' };
  if (fd.get('area_unit') === 'acre') area = area / ACRES_PER_HA;
  const dose = number(fd, 'dose');
  if (dose === 'bad' || dose === null || dose <= 0) return { error: 'Give the dose from the label.' };
  const dose_unit = String(fd.get('dose_unit') ?? 'L/ha');
  if (!(DOSE_UNITS as readonly string[]).includes(dose_unit)) return { error: 'Pick the dose unit.' };

  const water = number(fd, 'water_l_ha');
  const wind = number(fd, 'wind_mph');
  const temp = number(fd, 'temp_c');
  if (water === 'bad' || (water !== null && water <= 0)) return { error: 'The water volume doesn’t look right.' };
  if (wind === 'bad' || (wind !== null && (wind < 0 || wind >= 100))) return { error: 'The wind speed doesn’t look right.' };
  if (temp === 'bad' || (temp !== null && (temp <= -30 || temp >= 50))) return { error: 'The temperature doesn’t look right.' };
  const dir = String(fd.get('wind_direction') ?? '');
  if (dir && !(WIND_DIRECTIONS as readonly string[]).includes(dir)) return { error: 'Pick the wind direction.' };

  const stock = String(fd.get('stock_out_until') ?? '');
  if (stock && !isDay(stock)) return { error: 'The date stock can go back doesn’t look right.' };
  if (stock && stock < sprayed_on) return { error: 'Stock cannot go back before the day you sprayed.' };

  return {
    sprayed_on,
    start_time: times.start_time,
    end_time: times.end_time,
    site: texts.site,
    postcode: pc,
    customer: texts.customer,
    situation: texts.situation,
    area_ha: Math.round(area * 1000) / 1000,
    product: texts.product,
    mapp: mapp || null,
    dose,
    dose_unit,
    water_l_ha: water,
    target: texts.target,
    wind_mph: wind,
    wind_direction: dir || null,
    temp_c: temp,
    conditions: texts.conditions,
    operator: texts.operator,
    certificate: texts.certificate,
    equipment: texts.equipment,
    stock_out_until: stock || null,
    notes: texts.notes,
  };
}

/** Total product for the record, in litres or kilograms. */
export function productUsed(r: Pick<SprayRecord, 'dose' | 'dose_unit' | 'area_ha'>): { amount: number; unit: 'L' | 'kg' } {
  const small = r.dose_unit === 'ml/ha' || r.dose_unit === 'g/ha';
  const unit = r.dose_unit === 'L/ha' || r.dose_unit === 'ml/ha' ? 'L' : 'kg';
  return { amount: (r.dose * r.area_ha) / (small ? 1000 : 1), unit };
}

/**
 * A CSV cell. Text that a spreadsheet would run as a formula is defused with
 * a leading apostrophe: these files get opened in Excel by other people.
 */
function cell(v: string | number | null): string {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsCsv(rows: SprayRecord[]): string {
  const head = [
    'Date', 'Start', 'Finish', 'Field or site', 'Postcode', 'Customer', 'Crop or situation', 'Area (ha)', 'Area (acres)',
    'Product', 'MAPP number', 'Dose', 'Dose unit', 'Total product', 'Total unit', 'Water (L/ha)', 'Reason / target',
    'Wind (mph)', 'Wind from', 'Temperature (C)', 'Conditions', 'Operator', 'Certificate', 'Equipment', 'Stock out until', 'Notes',
  ];
  const lines = rows.map((r) => {
    const used = productUsed(r);
    return [
      r.sprayed_on, r.start_time?.slice(0, 5) ?? null, r.end_time?.slice(0, 5) ?? null, r.site, r.postcode, r.customer, r.situation,
      r.area_ha, Math.round(r.area_ha * ACRES_PER_HA * 100) / 100, r.product, r.mapp, r.dose, r.dose_unit,
      Math.round(used.amount * 1000) / 1000, used.unit, r.water_l_ha, r.target, r.wind_mph, r.wind_direction, r.temp_c,
      r.conditions, r.operator, r.certificate, r.equipment, r.stock_out_until, r.notes,
    ].map(cell).join(',');
  });
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}
