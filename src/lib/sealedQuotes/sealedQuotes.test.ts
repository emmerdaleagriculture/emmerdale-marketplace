import { describe, expect, it } from 'vitest';
import { computeClientPricePence, formatGBP, formatRate, poundsInputToPence } from './money';
import { generateToken, isTokenFormat, tokensEqual } from './tokens';
import { haversineMiles } from './geo';
import { sortClientQuotes, isNewContractor, type SortableQuote } from './quoteSort';
import { isOverdue } from './opsThresholds';

describe('computeClientPricePence — §18 markup, ceil to £5', () => {
  it('marks up 10% and rounds UP to the nearest 500p', () => {
    expect(computeClientPricePence(40000)).toBe(44000); // £400 → £440 exact
    expect(computeClientPricePence(40001)).toBe(44500); // £400.01 → £440.011 → £445
    expect(computeClientPricePence(45455)).toBe(50500); // £454.55 → £500.005 → £505
    expect(computeClientPricePence(100)).toBe(500); // £1 → £1.10 → £5 floor effect
  });

  it('never rounds down and is idempotent on £5 multiples of the marked-up price', () => {
    for (const p of [12345, 99999, 50000, 1, 200000]) {
      const out = computeClientPricePence(p);
      expect(out).toBeGreaterThanOrEqual((p * 110) / 100);
      expect(out % 500).toBe(0);
    }
  });

  // Fixture parity with SQL client_price_pence() — verified manually against
  // the DB after migration push; update both together.
  it('SQL parity fixtures', () => {
    const fixtures: [number, number][] = [
      [40000, 44000],
      [40001, 44500],
      [45455, 50500],
      [123456, 136000],
      [250000, 275000],
    ];
    for (const [input, expected] of fixtures) {
      expect(computeClientPricePence(input)).toBe(expected);
    }
  });

  it('rejects non-positive and non-integer input', () => {
    expect(() => computeClientPricePence(0)).toThrow();
    expect(() => computeClientPricePence(-5)).toThrow();
    expect(() => computeClientPricePence(10.5)).toThrow();
  });
});

describe('formatGBP / formatRate / poundsInputToPence', () => {
  it('formats whole pounds without pence, fractional with', () => {
    expect(formatGBP(125000)).toBe('£1,250');
    expect(formatGBP(125250)).toBe('£1,252.50');
    expect(formatGBP(500)).toBe('£5');
  });

  it('formats rates', () => {
    expect(formatRate(9000, 25000)).toBe('£90/acre (£250 minimum)');
    expect(formatRate(9000, null)).toBe('£90/acre');
  });

  it('parses form input', () => {
    expect(poundsInputToPence('450')).toBe(45000);
    expect(poundsInputToPence('£450.50')).toBe(45050);
    expect(poundsInputToPence('1,200')).toBe(120000);
    expect(poundsInputToPence('0')).toBeNull();
    expect(poundsInputToPence('abc')).toBeNull();
    expect(poundsInputToPence('45.999')).toBeNull();
  });
});

describe('tokens', () => {
  it('generates valid 48-hex tokens, unique across a small sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const t = generateToken();
      expect(isTokenFormat(t)).toBe(true);
      seen.add(t);
    }
    expect(seen.size).toBe(100);
  });

  it('rejects wrong formats', () => {
    expect(isTokenFormat('abc')).toBe(false);
    expect(isTokenFormat('G'.repeat(48))).toBe(false);
    expect(isTokenFormat(generateToken().toUpperCase())).toBe(false);
    expect(isTokenFormat(null)).toBe(false);
  });

  it('constant-time equality', () => {
    const t = generateToken();
    expect(tokensEqual(t, t)).toBe(true);
    expect(tokensEqual(t, generateToken())).toBe(false);
    expect(tokensEqual(t, t.slice(1))).toBe(false);
  });
});

describe('haversineMiles', () => {
  it('matches known UK distances within 0.5%', () => {
    // Winchester (51.0632,-1.308) to Salisbury (51.0693,-1.7945): ~21.2 miles
    const ws = haversineMiles(51.0632, -1.308, 51.0693, -1.7945)!;
    expect(ws).toBeGreaterThan(20.5);
    expect(ws).toBeLessThan(21.9);
    // London (51.5074,-0.1278) to Birmingham (52.4862,-1.8904): ~100.5 miles
    const lb = haversineMiles(51.5074, -0.1278, 52.4862, -1.8904)!;
    expect(lb).toBeGreaterThan(99);
    expect(lb).toBeLessThan(102);
  });

  it('null on missing coords', () => {
    expect(haversineMiles(null, 0, 51, -1)).toBeNull();
  });
});

describe('sortClientQuotes — §18a option C', () => {
  const q = (
    id: string,
    price: number,
    avg: number | null,
    count: number,
  ): SortableQuote => ({
    id,
    client_price_pence: price,
    contractor_rating_avg: avg,
    contractor_rating_count: count,
  });

  const quotes = [
    q('cheap-new', 40000, null, 0),
    q('mid-great', 45000, 4.9, 12),
    q('dear-great', 60000, 5.0, 30),
    q('cheap-poor', 41000, 2.0, 8),
  ];

  it('price mode is strictly ascending', () => {
    expect(sortClientQuotes(quotes, 'price', { ratingWeight: 0.3 }).map((x) => x.id)).toEqual([
      'cheap-new',
      'cheap-poor',
      'mid-great',
      'dear-great',
    ]);
  });

  it('rating mode ranks unrated last', () => {
    const ids = sortClientQuotes(quotes, 'rating', { ratingWeight: 0.3 }).map((x) => x.id);
    expect(ids[0]).toBe('dear-great');
    expect(ids[ids.length - 1]).toBe('cheap-new');
  });

  it('recommended boosts well-rated over slightly-cheaper poorly-rated', () => {
    const ids = sortClientQuotes(quotes, 'recommended', { ratingWeight: 0.3 }).map((x) => x.id);
    expect(ids.indexOf('mid-great')).toBeLessThan(ids.indexOf('cheap-poor'));
  });

  it('new contractors are neither penalised nor boosted', () => {
    expect(isNewContractor(q('x', 1, 4.5, 2))).toBe(true);
    expect(isNewContractor(q('x', 1, 4.5, 3))).toBe(false);
    // cheapest new contractor still leads when nothing outscores plain price
    const ids = sortClientQuotes(quotes, 'recommended', { ratingWeight: 0.1 }).map((x) => x.id);
    expect(ids[0]).toBe('cheap-new');
  });
});

describe('isOverdue — §30 thresholds', () => {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  it('flags past-threshold states', () => {
    expect(isOverdue('confirmed', at(16 * 60 * 1000))).toBe(true);
    expect(isOverdue('confirmed', at(10 * 60 * 1000))).toBe(false);
    expect(isOverdue('awarded', at(25 * 3600 * 1000))).toBe(true);
    expect(isOverdue('quotes_receiving', at(999 * 3600 * 1000))).toBe(false); // never flagged
    expect(isOverdue('unknown_state', at(999 * 3600 * 1000))).toBe(false);
  });
});
