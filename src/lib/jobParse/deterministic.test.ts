import { describe, expect, it } from 'vitest';
import {
  deterministicParse,
  extractDates,
  extractPostcode,
  extractQuantities,
  toAcres,
} from './deterministic';

const NOW = new Date('2026-08-27T12:00:00Z');

describe('extractPostcode', () => {
  it('takes the dedicated location input first', () => {
    const r = extractPostcode('anything at all', 'so24 9aa');
    expect(r.full).toBe('SO24 9AA');
  });

  it('forgives 0/O and 1/I mistypes', () => {
    expect(extractPostcode('', 's051 6fp').full).toBe('SO51 6FP'); // S-zero-51
    expect(extractPostcode('', 'SO51 6FP').full).toBe('SO51 6FP');
    expect(extractPostcode('', 's051').outcode).toBe('SO51');
    expect(extractPostcode('', 'HG1 2RW').full).toBe('HG1 2RW'); // real digits untouched
  });

  it('finds a full postcode embedded in the location field', () => {
    expect(extractPostcode('', 'Romsey SO51 6FP').full).toBe('SO51 6FP');
    expect(extractPostcode('', 'just outside Alresford, SO24 9AA').full).toBe('SO24 9AA');
  });

  it('accepts outcode-only from the location input', () => {
    const r = extractPostcode('', 'SO24');
    expect(r.full).toBeNull();
    expect(r.outcode).toBe('SO24');
  });

  it('finds a full postcode inside free text', () => {
    const r = extractPostcode('field is at GU34 3AB down the lane', '');
    expect(r.full).toBe('GU34 3AB');
  });

  it('does NOT mistake a road name for an outcode in free text', () => {
    // "A31" matches the outward-code shape; only the location field may claim it.
    const r = extractPostcode("it's just off the A31 near Alresford", '');
    expect(r.full).toBeNull();
    expect(r.outcode).toBeNull();
  });
});

describe('extractQuantities', () => {
  it('parses number + unit pairs', () => {
    expect(extractQuantities('7 acre field')).toEqual([
      { value: 7, unit: 'acres', raw: '7 acre' },
    ]);
    expect(extractQuantities('about 2.5 ha of paddock')).toEqual([
      { value: 2.5, unit: 'hectares', raw: '2.5 ha' },
    ]);
    expect(extractQuantities('200m of hedge and 3 tonnes of muck')).toEqual([
      { value: 200, unit: 'linear_m', raw: '200m' },
      { value: 3, unit: 'tonnes', raw: '3 tonnes' },
    ]);
  });

  it('stays silent when no quantity is written', () => {
    expect(extractQuantities("the paddock's got away from me, needs cutting back")).toEqual([]);
  });
});

describe('toAcres', () => {
  it('converts hectares and sq_m; passes acres through; refuses linear_m', () => {
    expect(toAcres(1, 'acres')).toBe(1);
    expect(toAcres(1, 'hectares')).toBeCloseTo(2.47105);
    expect(toAcres(4046.86, 'sq_m')).toBeCloseTo(1);
    expect(toAcres(100, 'linear_m')).toBeNull();
  });
});

describe('extractDates', () => {
  it('explicit numeric dates', () => {
    expect(extractDates('needs doing by 12/09/2026', NOW)).toEqual({
      urgency: 'dated',
      target_date: '2026-09-12',
    });
  });

  it('day + month, rolling into next year when past', () => {
    expect(extractDates('come on the 3rd of March', NOW)).toEqual({
      urgency: 'dated',
      target_date: '2027-03-03',
    });
  });

  it('"before September" → first of the month', () => {
    expect(extractDates('needs topping before September', NOW)).toEqual({
      urgency: 'dated',
      target_date: '2026-09-01',
    });
  });

  it('"next week" resolves relative to now', () => {
    expect(extractDates('could you come next week', NOW)).toEqual({
      urgency: 'dated',
      target_date: '2026-09-03',
    });
  });

  it('urgency keywords', () => {
    expect(extractDates('need it done asap', NOW).urgency).toBe('asap');
    expect(extractDates('sometime this month ideally', NOW).urgency).toBe('within_month');
    expect(extractDates('no rush at all', NOW).urgency).toBe('flexible');
  });

  it('stays silent otherwise', () => {
    expect(extractDates('the field needs cutting', NOW)).toEqual({
      urgency: null,
      target_date: null,
    });
  });
});

describe('deterministicParse — spec §12 worked examples', () => {
  it('"7 acre field topped, just off the A31" + postcode', () => {
    const r = deterministicParse(
      "I need my 7 acre field topped, it's just off the A31 near Alresford",
      'SO24 9AA',
      NOW,
    );
    expect(r.postcode_full).toBe('SO24 9AA');
    expect(r.area).toEqual({ value: 7, unit: 'acres' });
    // The road name must not leak in as a postcode.
    expect(r.quantities).toHaveLength(1);
  });

  it('"the paddock\'s got away from me" yields nothing — no guessing', () => {
    const r = deterministicParse("the paddock's got away from me, needs cutting back", '', NOW);
    expect(r.postcode_full).toBeNull();
    expect(r.postcode_outcode).toBeNull();
    expect(r.area).toBeNull();
    expect(r.urgency).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.email).toBeNull();
  });

  it('recovers contact details when present', () => {
    const r = deterministicParse('ring me on 07700 900123 or jo@example.com', '', NOW);
    expect(r.phone).toBe('07700 900123');
    expect(r.email).toBe('jo@example.com');
  });
});
