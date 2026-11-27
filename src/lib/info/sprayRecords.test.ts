import { describe, expect, it } from 'vitest';
import { productUsed, readSprayRecord, recordsCsv, tidyPostcode, type SprayRecord } from './sprayRecords';

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    sprayed_on: '2026-06-10', site: 'Top paddock', situation: 'Grazing paddock', area: '5', area_unit: 'acre',
    product: 'Doxstar Pro', dose: '2', dose_unit: 'L/ha', operator: 'A. Sprayer',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
}
const TODAY = '2026-06-10';

describe('reading a spray record', () => {
  it('takes the least the law asks for, and turns acres into hectares', () => {
    const r = readSprayRecord(form(), TODAY);
    if ('error' in r) throw new Error(r.error);
    expect(r.area_ha).toBeCloseTo(2.023, 3);
    expect(r).toMatchObject({ product: 'Doxstar Pro', dose: 2, dose_unit: 'L/ha', mapp: null, postcode: null, stock_out_until: null });
  });
  it('tidies the extras', () => {
    const r = readSprayRecord(form({ mapp: 'MAPP 15664', postcode: 'so51 0hn', wind_mph: '4,5', wind_direction: 'SW', start_time: '07:30:00', stock_out_until: '2026-06-17' }), TODAY);
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ mapp: '15664', postcode: 'SO51 0HN', wind_mph: 4.5, wind_direction: 'SW', start_time: '07:30', stock_out_until: '2026-06-17' });
  });
  it('refuses what cannot be right', () => {
    const bad = (over: Record<string, string>) => 'error' in readSprayRecord(form(over), TODAY);
    expect(bad({ sprayed_on: '2026-06-11' })).toBe(true); // tomorrow
    expect(bad({ product: ' ' })).toBe(true);
    expect(bad({ dose: '0' })).toBe(true);
    expect(bad({ area: 'lots' })).toBe(true);
    expect(bad({ dose_unit: 'pints' })).toBe(true);
    expect(bad({ postcode: 'nowhere' })).toBe(true);
    expect(bad({ stock_out_until: '2026-06-01' })).toBe(true);
    expect(bad({ mapp: '12' })).toBe(true);
  });
  it('knows a postcode from its first half', () => {
    expect(tidyPostcode('so510hn')).toBe('SO51 0HN');
    expect(tidyPostcode('gu1')).toBe('GU1');
    expect(tidyPostcode('hello')).toBeNull();
  });
});

describe('totals and the spreadsheet', () => {
  const row: SprayRecord = {
    id: '1', sprayed_on: '2026-06-10', start_time: '07:30:00', end_time: null, site: 'Top paddock, "the wet end"', postcode: 'SO51', customer: null,
    situation: 'Grazing paddock', area_ha: 2, product: '=HYPERLINK("x")', mapp: '15664', dose: 500, dose_unit: 'ml/ha', water_l_ha: 300, target: 'Docks',
    wind_mph: 4, wind_direction: 'SW', temp_c: 14, conditions: null, operator: 'A. Sprayer', certificate: 'PA1, PA2', equipment: null, stock_out_until: '2026-06-17', notes: null, run_id: null,
  };
  it('adds up the product used', () => {
    expect(productUsed(row)).toEqual({ amount: 1, unit: 'L' });
    expect(productUsed({ dose: 60, dose_unit: 'g/ha', area_ha: 2 })).toEqual({ amount: 0.12, unit: 'kg' });
  });
  it('quotes cells and defuses formulas', () => {
    const [head, line] = recordsCsv([row]).trim().split('\r\n');
    expect(head.split(',')).toHaveLength(26);
    expect(line).toContain('"Top paddock, ""the wet end"""');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain('"PA1, PA2"');
  });
});
