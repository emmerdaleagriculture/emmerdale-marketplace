/**
 * Figures for /info/fertiliser, from AHDB's Nutrient Management Guide
 * (RB209), March 2026 edition, read on 2026-11-27. Section 3 is grass and
 * forage, Section 1 lime, Section 2 organic materials. Rates are kg/ha.
 * Nothing here is from memory: a figure the guide does not give is left out.
 */

export const RB209_URL = 'https://ahdb.org.uk/rb209';

/** Phosphate and potash by soil index (Tables 3.4, 3.5, 3.3). */
export const PK_ROWS: { use: string; nutrient: string; byIndex: [string, string, string, string, string] }[] = [
  { use: 'Grazing', nutrient: 'Phosphate', byIndex: ['80', '50', '20', '0', '0'] },
  { use: 'Grazing', nutrient: 'Potash', byIndex: ['60', '30', '0', '0', '0'] },
  { use: 'Hay', nutrient: 'Phosphate', byIndex: ['80', '55', '30', '0', '0'] },
  { use: 'Hay', nutrient: 'Potash', byIndex: ['140', '115', '90 (2-) or 65 (2+)', '20', '0'] },
  { use: 'Silage, first cut', nutrient: 'Phosphate', byIndex: ['100', '70', '40', '20', '0'] },
  { use: 'Silage, first cut', nutrient: 'Potash, in spring', byIndex: ['80', '80', '80 (2-) or 60 (2+)', '30', '0'] },
];

/** Nitrogen for grazing: the season's total by the yield wanted (Table 3.9). */
export const GRAZING_N: { yieldT: string; totalN: number }[] = [
  { yieldT: '4 to 5', totalN: 30 },
  { yieldT: '5 to 7', totalN: 50 },
  { yieldT: '6 to 8', totalN: 80 },
  { yieldT: '7 to 9', totalN: 130 },
  { yieldT: '9 to 12', totalN: 180 },
  { yieldT: '10 to 13', totalN: 230 },
  { yieldT: '12 to 15 or more', totalN: 270 },
];

/** Nitrogen for silage, per cut (Table 3.8). */
export const SILAGE_N: { yieldT: string; cuts: (number | null)[]; total: number }[] = [
  { yieldT: '5 to 7', cuts: [70, null, null, null], total: 70 },
  { yieldT: '7 to 9', cuts: [80, 50, null, null], total: 130 },
  { yieldT: '9 to 12', cuts: [100, 75, 75, null], total: 250 },
  { yieldT: '12 to 15 or more', cuts: [120, 90, 70, 30], total: 310 },
];

/** Lime: tonnes a hectare of ground limestone per pH point to raise, on grass (Section 1, Table 1.2). */
export const LIMING_FACTORS: { soil: string; factor: number; optimum: number }[] = [
  { soil: 'Sands', factor: 4, optimum: 6.0 },
  { soil: 'Sandy and silt loams', factor: 5, optimum: 6.0 },
  { soil: 'Clay loams and clays', factor: 6, optimum: 6.0 },
  { soil: 'Organic soils', factor: 7.5, optimum: 5.7 },
  { soil: 'Peaty soils', factor: 12, optimum: 5.3 },
];

/** Manures, per tonne or cubic metre fresh (Section 2). Total, with what the crop can use in brackets on the page. */
export const MANURES: { name: string; per: string; n: number; p: [number, number]; k: [number, number] }[] = [
  { name: 'Cattle farmyard manure', per: 'tonne', n: 6.0, p: [3.2, 1.9], k: [9.4, 8.5] },
  { name: 'Horse manure', per: 'tonne', n: 5.0, p: [5.0, 3.0], k: [6.0, 5.4] },
  { name: 'Cattle slurry (6% dry matter)', per: 'm³', n: 2.6, p: [1.2, 0.6], k: [2.5, 2.3] },
];
