import { describe, expect, it } from 'vitest';
import type { Slot } from './forecast';
import { slotsFromMet, slotsFromOpenMeteo } from './forecast';
import { goodWindows, isDaylight, rainAhead, rate } from './windows';
import { groupDays } from './windowsView';

// A June day in Hampshire: daylight from about 4am to 8.20pm UTC.
const LAT = 51.06;
const LNG = -1.31;
const T0 = Date.UTC(2026, 5, 15, 0);

function hours(n: number, over: Partial<Slot> | ((i: number) => Partial<Slot>) = {}): Slot[] {
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(T0 + i * 3600000).toISOString(),
    hours: 1 as const,
    tempC: 14,
    // 2.5 m/s at 10 m is 4.5 km/h at the boom: inside the ideal band.
    windMs: 2.5,
    humidity: 70,
    dewPointC: 8,
    rainMm: 0,
    ...(typeof over === 'function' ? over(i) : over),
  }));
}
const levelAt = (slots: Slot[], job: 'spray' | 'fertilise' | 'seed', i: number) => rate(slots, job, LAT, LNG)[i];

describe('spraying', () => {
  it('is good in a light breeze, dry and mild', () => {
    expect(levelAt(hours(12), 'spray', 9).level).toBe('good');
  });
  it('follows the Code of Practice wind bands at the boom', () => {
    // boom km/h = m/s x 3.6 x 0.5
    expect(levelAt(hours(12, { windMs: 1 }), 'spray', 9).level).toBe('care'); // 1.8: calm
    expect(levelAt(hours(12, { windMs: 1.5 }), 'spray', 9).level).toBe('good'); // 2.7: acceptable
    expect(levelAt(hours(12, { windMs: 3.5 }), 'spray', 9).level).toBe('good'); // 6.3: ideal
    expect(levelAt(hours(12, { windMs: 4.5 }), 'spray', 9).level).toBe('care'); // 8.1: avoid herbicides
    expect(levelAt(hours(12, { windMs: 5.5 }), 'spray', 9).level).toBe('no'); // 9.9: do not spray
  });
  it('rules out rain now and rain within two hours, and watches six', () => {
    const wetAt = (k: number) => hours(24, (i) => (i === k ? { rainMm: 1 } : {}));
    expect(levelAt(wetAt(9), 'spray', 9).reasons[0]).toBe('Rain');
    expect(levelAt(wetAt(11), 'spray', 9).level).toBe('no');
    expect(levelAt(wetAt(14), 'spray', 9).level).toBe('care');
    expect(levelAt(wetAt(18), 'spray', 9).level).toBe('good');
  });
  it('rules out frost and heat above 30°C', () => {
    expect(levelAt(hours(12, { tempC: 0.5, dewPointC: -3 }), 'spray', 9).level).toBe('no');
    expect(levelAt(hours(12, { tempC: 28 }), 'spray', 9).level).toBe('care');
    expect(levelAt(hours(12, { tempC: 31 }), 'spray', 9).level).toBe('no');
  });
});

describe('fertilising', () => {
  it('is good when mild and mostly dry', () => {
    expect(levelAt(hours(130), 'fertilise', 9).level).toBe('good');
  });
  it('rules out heavy rain in 48 hours and freezing air', () => {
    expect(levelAt(hours(130, (i) => (i === 30 ? { rainMm: 20 } : {})), 'fertilise', 9).level).toBe('no');
    expect(levelAt(hours(130, { tempC: -1 }), 'fertilise', 9).level).toBe('no');
  });
  it('flags a cold spell', () => {
    const r = levelAt(hours(130, { tempC: 3 }), 'fertilise', 9);
    expect(r.level).toBe('care');
    expect(r.reasons.join(' ')).toContain('nitrogen');
  });
});

describe('seeding', () => {
  it('wants warmth and rain to come', () => {
    expect(levelAt(hours(130, (i) => (i === 40 ? { rainMm: 8 } : {})), 'seed', 9).level).toBe('good');
    expect(levelAt(hours(130), 'seed', 9).level).toBe('care'); // dry
    expect(levelAt(hours(130, { tempC: 4 }), 'seed', 9).level).toBe('no');
  });
});

describe('helpers', () => {
  it('shares a six-hour slot of rain pro rata', () => {
    const slots: Slot[] = [{ ...hours(1)[0], hours: 6, rainMm: 6 }];
    expect(rainAhead(slots, 0, 0, 3)).toBeCloseTo(3);
  });
  it('knows day from night', () => {
    expect(isDaylight('2026-06-15T12:00:00Z', LAT, LNG)).toBe(true);
    expect(isDaylight('2026-06-15T01:00:00Z', LAT, LNG)).toBe(false);
    expect(isDaylight('2026-12-15T17:00:00Z', LAT, LNG)).toBe(false);
  });
  it('finds daylight runs of good hours only', () => {
    const rated = rate(hours(24, (i) => (i >= 12 && i < 15 ? { windMs: 8 } : {})), 'spray', LAT, LNG);
    const w = goodWindows(rated);
    expect(w[0].start).toBe(new Date(T0 + 4 * 3600000).toISOString());
    expect(w[0].end).toBe(new Date(T0 + 12 * 3600000).toISOString());
    expect(w[1].start).toBe(new Date(T0 + 15 * 3600000).toISOString());
  });
  it('folds a day into runs by rating', () => {
    const rated = rate(hours(24, (i) => (i >= 12 && i < 15 ? { windMs: 8 } : {})), 'spray', LAT, LNG);
    const [day] = groupDays(rated, new Date(T0));
    expect(day.label).toBe('Today');
    expect(day.runs.map((r) => r.level)).toEqual(['good', 'no', 'good']);
    // MET Norway's times carry no milliseconds; the runs must still join.
    const bare = rate(hours(24).map((s) => ({ ...s, t: s.t.replace('.000Z', 'Z') })), 'spray', LAT, LNG);
    expect(groupDays(bare, new Date(T0))[0].runs).toHaveLength(1);
  });
  it('reads MET Norway series, dropping entries with no rain figure', () => {
    const slots = slotsFromMet([
      { time: 'a', data: { instant: { details: { air_temperature: 7, wind_speed: 4, relative_humidity: 90, dew_point_temperature: 6 } }, next_1_hours: { details: { precipitation_amount: 0.3 } } } },
      { time: 'b', data: { instant: { details: { air_temperature: 7, wind_speed: 4 } }, next_6_hours: { details: { precipitation_amount: 2 } } } },
      { time: 'c', data: { instant: { details: { air_temperature: 7, wind_speed: 4 } } } },
    ]);
    expect(slots.map((s) => [s.t, s.hours, s.rainMm])).toEqual([['a', 1, 0.3], ['b', 6, 2]]);
  });
});

describe('with Open-Meteo', () => {
  it('reads rain and gusts from the following hour and drops hours gone by', () => {
    const t = T0 / 1000;
    const slots = slotsFromOpenMeteo(
      {
        time: [t, t + 3600, t + 7200, t + 10800],
        temperature_2m: [10, 11, 12, 13],
        relative_humidity_2m: [80, 80, 80, 80],
        dew_point_2m: [6, 6, 6, 6],
        precipitation: [9, 0.1, 0.2, 0.3],
        wind_speed_10m: [2, 2, 2, 2],
        wind_gusts_10m: [9, 4, 5, 6],
        soil_temperature_6cm: [7, 7.1, 7.2, 7.3],
      },
      T0 + 3600000 + 60000,
    );
    // The first hour is over; the last has no following entry for its rain.
    expect(slots.map((s) => [s.tempC, s.rainMm, s.gustMs, s.soilC])).toEqual([
      [11, 0.2, 5, 7.1],
      [12, 0.3, 6, 7.2],
    ]);
  });
  it('rules spraying out in strong gusts and warns in moderate ones', () => {
    // Mean 2.5 m/s is ideal; a 6 m/s gust is 10.8 km/h at the boom, 9 m/s is 16.2.
    expect(levelAt(hours(12, { gustMs: 4 }), 'spray', 9).level).toBe('good');
    expect(levelAt(hours(12, { gustMs: 6 }), 'spray', 9).level).toBe('care');
    expect(levelAt(hours(12, { gustMs: 9 }), 'spray', 9).level).toBe('no');
  });
  it('uses soil temperature for seed and nitrogen when it has one', () => {
    // Warm air over cold soil: an April morning.
    const cold = hours(130, (i) => ({ soilC: 4, ...(i === 40 ? { rainMm: 8 } : {}) }));
    expect(levelAt(cold, 'seed', 9).level).toBe('no');
    expect(levelAt(cold, 'fertilise', 9).reasons.join(' ')).toContain('Cold soil');
    const warm = hours(130, (i) => ({ soilC: 9, ...(i === 40 ? { rainMm: 8 } : {}) }));
    expect(levelAt(warm, 'seed', 9).level).toBe('good');
    expect(levelAt(hours(130, { soilC: -0.5 }), 'fertilise', 9).reasons[0]).toBe('Frozen ground');
  });
});
