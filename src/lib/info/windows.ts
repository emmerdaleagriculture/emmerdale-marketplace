import type { Slot } from './forecast';

/**
 * Work windows: each forecast slot rated for a job.
 *
 *   good — nothing in the forecast against it
 *   care — workable, with the named thing to watch
 *   no   — the forecast rules it out
 *
 * Pure functions over the slots, so every rule is tested without a network
 * (windows.test.ts). The limits and where each comes from are in LIMITS; the
 * page prints the same figures under "How the ratings are worked out", so a
 * change here must be made there too (it reads these constants).
 */

export type Job = 'spray' | 'fertilise' | 'seed';
export type Level = 'good' | 'care' | 'no';

export type Rated = Slot & {
  level: Level;
  /** Why it is not "good", most serious first. Empty when good. */
  reasons: string[];
  /** Wind at boom height, mph: the figure the spraying code is written in. */
  boomMph: number;
  daylight: boolean;
};

export const LIMITS = {
  /**
   * Forecast wind is measured 10 m up; the Code of Practice for Using Plant
   * Protection Products (section 4.7, table 6) gives its limits at nozzle
   * height. The Code has no formula for getting from one to the other, but
   * its own table pairs each Beaufort force (a 10 m measure) with a
   * nozzle-height speed about half as fast, so half is what we take. Our
   * reading of the table, not a figure the Code states.
   */
  boomFactor: 0.5,
  /**
   * The Code's table, km/h at nozzle height: under 2 calm (medium or coarse
   * spray only), 2 to 3.2 acceptable, 3.2 to 6.5 ideal, 6.5 to 9.6
   * "increased risk of spray drift, avoid spraying herbicides", above 9.6
   * "do not spray".
   */
  sprayCalmKmh: 2,
  sprayIdealMinKmh: 3.2,
  sprayIdealMaxKmh: 6.5,
  sprayMaxKmh: 9.6,
  /**
   * Hours after spraying that must stay dry, and the wider watch. The Code
   * sets no figure: rainfast times are on the label. Two hours is what
   * Corteva gives for Doxstar Pro and Grazon Pro.
   */
  sprayDryHours: 2,
  sprayWatchHours: 6,
  /** Rain that counts, mm in an hour. Ours. */
  rainMm: 0.2,
  /** The Code: avoid spraying above 30°C. */
  sprayHotC: 30,
  /** Rules of thumb, not from the Code: frost, slow growth, warm dry air. */
  sprayFrostC: 1,
  sprayCoolC: 6,
  sprayWarmC: 25,
  sprayDryAirPct: 40,
  /** Dew (rule of thumb): air within this of its dew point, and humid. */
  dewGapC: 1,
  dewHumidityPct: 95,

  /**
   * Fertiliser. The Farming Rules for Water say to take the forecast into
   * account and name no amount; these two are ours. (Scotland's rule is
   * heavy rain forecast within 24 hours.)
   */
  fertHeavyRainMm: 15,
  fertWetRainMm: 6,
  fertFrozenC: 0,
  /** AHDB: grass starts to grow, and to use nitrogen, at 5°C at 10 cm. */
  fertGrowthC: 5,
  /** Rule of thumb: a spinner's pattern suffers above this at 10 m, mph. */
  fertWindMph: 15,

  /**
   * Seed: mean temperature of the five days ahead, standing in for soil.
   * 8°C is the seed trade's figure; no official UK one was found.
   */
  seedGrassC: 8,
  seedMarginalC: 6,
  seedFrostC: 0,
  /** Rain over the five days ahead that will bring seed up, mm. */
  seedMoistureMm: 5,
  seedWetDayMm: 8,
} as const;

const MS_TO_KMH = 3.6;
const KMH_TO_MPH = 0.621371;

export function boomKmh(windMs: number): number {
  return windMs * MS_TO_KMH * LIMITS.boomFactor;
}

/** Sun above the horizon at this moment and place (to within a few minutes). */
export function isDaylight(iso: string, lat: number, lng: number): boolean {
  const d = new Date(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const day = Math.floor((d.getTime() - start) / 86400000);
  const rad = Math.PI / 180;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (day + 10));
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + lng / 15;
  const hourAngle = 15 * (hours - 12);
  const elevation = Math.asin(
    Math.sin(rad * lat) * Math.sin(rad * decl) + Math.cos(rad * lat) * Math.cos(rad * decl) * Math.cos(rad * hourAngle),
  );
  return elevation > 0;
}

function at(s: Slot): number {
  return new Date(s.t).getTime();
}

/** Rain falling between two moments after `from` (hours), pro rata across slots. */
export function rainAhead(slots: Slot[], i: number, fromH: number, toH: number): number {
  const t0 = at(slots[i]) + fromH * 3600000;
  const t1 = at(slots[i]) + toH * 3600000;
  let mm = 0;
  for (let j = i; j < slots.length; j++) {
    const a = at(slots[j]);
    const b = a + slots[j].hours * 3600000;
    if (a >= t1) break;
    const overlap = Math.min(b, t1) - Math.max(a, t0);
    if (overlap > 0) mm += slots[j].rainMm * (overlap / (b - a));
  }
  return mm;
}

/** Mean and lowest temperature over the hours ahead, weighted by slot length. */
export function tempAhead(slots: Slot[], i: number, hours: number): { mean: number; min: number } {
  const end = at(slots[i]) + hours * 3600000;
  let sum = 0;
  let w = 0;
  let min = Infinity;
  for (let j = i; j < slots.length && at(slots[j]) < end; j++) {
    sum += slots[j].tempC * slots[j].hours;
    w += slots[j].hours;
    min = Math.min(min, slots[j].tempC);
  }
  return { mean: w ? sum / w : slots[i].tempC, min: Number.isFinite(min) ? min : slots[i].tempC };
}

type Verdict = { level: Level; reasons: string[] };

function verdict(no: string[], care: string[]): Verdict {
  if (no.length) return { level: 'no', reasons: [...no, ...care] };
  if (care.length) return { level: 'care', reasons: care };
  return { level: 'good', reasons: [] };
}

const mph = (kmh: number) => Math.round(kmh * KMH_TO_MPH);

function spray(slots: Slot[], i: number): Verdict {
  const s = slots[i];
  const no: string[] = [];
  const care: string[] = [];
  const L = LIMITS;

  // Rain per hour, so a six-hour outlook slot is judged on the same scale.
  const rate = s.rainMm / s.hours;
  const soon = rainAhead(slots, i, s.hours, s.hours + L.sprayDryHours);
  const later = rainAhead(slots, i, s.hours + L.sprayDryHours, s.hours + L.sprayWatchHours);
  if (rate >= L.rainMm) no.push('Rain');
  else if (soon >= L.rainMm) no.push(`Rain within ${L.sprayDryHours} hours`);
  else if (later >= L.rainMm) care.push(`Rain within ${L.sprayWatchHours} hours: check the label's rainfast time`);

  const wind = boomKmh(s.windMs);
  if (wind > L.sprayMaxKmh) no.push(`Too windy: about ${mph(wind)} mph at the boom`);
  else if (wind > L.sprayIdealMaxKmh) care.push(`Breezy, about ${mph(wind)} mph at the boom: the Code says avoid herbicides in this`);
  else if (wind < L.sprayCalmKmh) care.push('Calm: medium or coarse spray only, fine spray hangs and drifts');

  if (s.tempC <= L.sprayFrostC) no.push('Frost');
  else if (s.tempC < L.sprayCoolC) care.push(`Cold (${Math.round(s.tempC)}°C): weeds are barely growing, so uptake is slow`);
  if (s.tempC > L.sprayHotC) no.push(`Too hot (${Math.round(s.tempC)}°C)`);
  else if (s.tempC > L.sprayWarmC) care.push(`Hot (${Math.round(s.tempC)}°C): spray evaporates and grass can scorch, go early or late`);
  else if (s.tempC > 20 && s.humidity < L.sprayDryAirPct) care.push('Warm, dry air: droplets evaporate before they land');

  if (s.tempC > L.sprayFrostC && s.tempC - s.dewPointC <= L.dewGapC && s.humidity >= L.dewHumidityPct && rate < L.rainMm) {
    care.push('Heavy dew likely: wet leaves shed spray');
  }
  return verdict(no, care);
}

function fertilise(slots: Slot[], i: number): Verdict {
  const s = slots[i];
  const no: string[] = [];
  const care: string[] = [];
  const L = LIMITS;

  const rain48 = rainAhead(slots, i, 0, 48);
  const { mean, min } = tempAhead(slots, i, 120);
  if (s.tempC <= L.fertFrozenC) no.push('Freezing: no spreading on frozen ground');
  if (rain48 >= L.fertHeavyRainMm) no.push(`Heavy rain coming (${Math.round(rain48)} mm in 48 hours): run-off risk`);
  else if (rain48 >= L.fertWetRainMm) care.push(`${Math.round(rain48)} mm of rain in the next 48 hours: fine on level, free-draining ground only`);
  if (s.tempC > L.fertFrozenC && min <= L.fertFrozenC) care.push('Frost in the days ahead: check the ground is not frozen');
  if (mean < L.fertGrowthC) care.push(`Cold spell (${mean.toFixed(1)}°C average ahead): grass will not use nitrogen yet`);
  const wind10 = s.windMs * MS_TO_KMH * KMH_TO_MPH;
  if (wind10 > L.fertWindMph) care.push(`Windy (${Math.round(wind10)} mph): a spinner's spread pattern suffers`);
  return verdict(no, care);
}

function seed(slots: Slot[], i: number): Verdict {
  const s = slots[i];
  const no: string[] = [];
  const care: string[] = [];
  const L = LIMITS;

  const { mean, min } = tempAhead(slots, i, 120);
  const rain5d = rainAhead(slots, i, 0, 120);
  const rain24 = rainAhead(slots, i, 0, 24);
  if (mean < L.seedMarginalC) no.push(`Too cold (${mean.toFixed(1)}°C average ahead): grass seed will sit, not grow`);
  else if (mean < L.seedGrassC) care.push(`Cool (${mean.toFixed(1)}°C average ahead): slow to come up`);
  if (s.rainMm / s.hours >= 1) no.push('Raining: wait for the ground to carry the drill');
  else if (rain24 >= L.seedWetDayMm) care.push(`${Math.round(rain24)} mm of rain in 24 hours: the ground may be too wet to travel`);
  if (min <= L.seedFrostC) care.push('Frost in the next five days: hard on new seedlings');
  if (rain5d < L.seedMoistureMm && mean >= L.seedMarginalC) care.push('Little rain in the next five days: only sow into moist ground');
  return verdict(no, care);
}

const RULES: Record<Job, (slots: Slot[], i: number) => Verdict> = { spray, fertilise, seed };

export function rate(slots: Slot[], job: Job, lat: number, lng: number): Rated[] {
  return slots.map((s, i) => ({
    ...s,
    ...RULES[job](slots, i),
    boomMph: mph(boomKmh(s.windMs)),
    // A six-hour slot counts as daylight if its middle is.
    daylight: isDaylight(new Date(at(s) + (s.hours * 3600000) / 2).toISOString(), lat, lng),
  }));
}

export type Window = { start: string; end: string; hours: number };

/**
 * Runs of daylight slots rated good, at least `minHours` long, soonest
 * first. Fertilising and seeding are day jobs too: nobody wants "3am".
 */
export function goodWindows(rated: Rated[], minHours = 2): Window[] {
  const out: Window[] = [];
  let run: Rated[] = [];
  const flush = () => {
    const hours = run.reduce((n, r) => n + r.hours, 0);
    if (run.length && hours >= minHours) {
      const last = run[run.length - 1];
      out.push({ start: run[0].t, end: new Date(at(last) + last.hours * 3600000).toISOString(), hours });
    }
    run = [];
  };
  for (const r of rated) {
    const prev = run[run.length - 1];
    const contiguous = !prev || at(prev) + prev.hours * 3600000 === at(r);
    if (r.level === 'good' && r.daylight && contiguous) run.push(r);
    else {
      flush();
      if (r.level === 'good' && r.daylight) run.push(r);
    }
  }
  flush();
  return out;
}
