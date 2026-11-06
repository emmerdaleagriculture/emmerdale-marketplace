import { describe, expect, it } from 'vitest';
import {
  type CostSnapshot,
  type Rate,
  NO_DATA_FILL,
  RATE_BINS,
  countiesWithData,
  countyAverages,
  countyRates,
  countyVar,
  mapVars,
  pounds,
  range,
  rateBinsInUse,
  rateFill,
  regionsWithData,
  servicesByJobs,
  totals,
} from './model';

const rate = (over: Partial<Rate>): Rate => ({
  scope: 'county',
  region: 'South East',
  county: 'Surrey',
  serviceId: 1,
  service: 'Paddock topping',
  jobs: 1,
  quotes: 1,
  acres: 2,
  avg: 27400,
  median: 27400,
  low: 27400,
  high: 27400,
  ...over,
});

const snapshot: CostSnapshot = {
  computedAt: '2026-11-01T03:35:00Z',
  since: '2026-09-21T10:00:00Z',
  uk: [
    rate({ scope: 'uk', region: null, county: null, serviceId: 1, service: 'Paddock topping', jobs: 9, quotes: 36 }),
    rate({ scope: 'uk', region: null, county: null, serviceId: 11, service: 'Weed control', jobs: 10, quotes: 20, avg: 16100 }),
  ],
  regions: [
    rate({ scope: 'region', county: null, serviceId: 1, jobs: 2 }),
    rate({ scope: 'region', county: null, region: 'Scotland', serviceId: 1, jobs: 2, avg: 11100 }),
  ],
  counties: [
    rate({ serviceId: 1, jobs: 2, low: 20000, high: 34800 }),
    rate({ serviceId: 11, service: 'Weed control', avg: 16700 }),
    rate({ county: 'Aberdeenshire', region: 'Scotland', serviceId: 11, service: 'Weed control', avg: 6300 }),
  ],
};

describe('formatting', () => {
  it('rounds pence to whole pounds with a thousands separator', () => {
    expect(pounds(16149)).toBe('£161');
    expect(pounds(361300)).toBe('£3,613');
  });
  it('collapses a range whose ends agree', () => {
    expect(range({ low: 20000, high: 34800 })).toBe('£200 to £348');
    expect(range({ low: 27400, high: 27400 })).toBe('£274');
  });
});

describe('shaping', () => {
  it('orders services by priced jobs, busiest first', () => {
    expect(servicesByJobs(snapshot).map((r) => r.service)).toEqual(['Weed control', 'Paddock topping']);
  });
  it('keys one service’s county figures by county name', () => {
    const by = countyAverages(snapshot, 11);
    expect(Object.keys(by).sort()).toEqual(['Aberdeenshire', 'Surrey']);
    expect(by.Surrey.avg).toBe(16700);
  });
  it('lists a county’s services busiest first', () => {
    expect(countyRates(snapshot, 'Surrey').map((r) => r.service)).toEqual(['Paddock topping', 'Weed control']);
    expect(countyRates(snapshot, 'Kent')).toEqual([]);
  });
  it('lists regions and counties with data alphabetically', () => {
    expect(regionsWithData(snapshot)).toEqual(['Scotland', 'South East']);
    expect(countiesWithData(snapshot)).toEqual(['Aberdeenshire', 'Surrey']);
  });
  it('totals jobs and prices from the UK rows only', () => {
    expect(totals(snapshot)).toEqual({ jobs: 19, quotes: 56, counties: 2 });
  });
});

describe('map shading', () => {
  it('shades by fixed pound bands and neutral for no figure', () => {
    expect(rateFill(undefined)).toBe(NO_DATA_FILL);
    expect(rateFill(0)).toBe(RATE_BINS[4].fill);
    expect(rateFill(9999)).toBe(RATE_BINS[4].fill);
    expect(rateFill(10000)).toBe(RATE_BINS[3].fill);
    expect(rateFill(27400)).toBe(RATE_BINS[2].fill);
    expect(rateFill(60000)).toBe(RATE_BINS[0].fill);
  });
  it('legend shows only the bands on the map', () => {
    const bins = rateBinsInUse(countyAverages(snapshot, 11));
    expect(bins.map((b) => b.label)).toEqual(['£100 to £199', 'Under £100']);
  });
  it('names a CSS variable per county', () => {
    expect(countyVar('East Riding of Yorkshire')).toBe('--c-east-riding-of-yorkshire');
    expect(countyVar('Hay & Straw')).toBe('--c-hay-and-straw');
  });
  it('builds the map variables: a fill per county with a figure, a stroke for the chosen one', () => {
    expect(mapVars(countyAverages(snapshot, 11), 'Surrey')).toEqual({
      '--c-surrey': RATE_BINS[3].fill,
      '--c-aberdeenshire': RATE_BINS[4].fill,
      '--c-surrey-s': '#ffde00',
      '--c-surrey-w': '2.5',
    });
    expect(mapVars({}, null)).toEqual({});
  });
});
