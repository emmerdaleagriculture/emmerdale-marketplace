/**
 * The sums behind /info/spray-rates. Pure, and tested (sprayMaths.test.ts):
 * a wrong figure here is a wrong dose in somebody's tank.
 *
 * Doses are per hectare, as labels give them. `unit` is whatever the label
 * uses (litres or kilograms); the sums are the same either way.
 */

export const ACRES_PER_HA = 2.4710538;
export const M2_PER_HA = 10000;

export const toHa = (area: number, unit: 'ha' | 'acre') => (unit === 'ha' ? area : area / ACRES_PER_HA);
export const perAcre = (perHa: number) => perHa / ACRES_PER_HA;

export type TankMix = {
  /** Product for the whole job, in the dose's unit. */
  product: number;
  /** Spray (water plus product) for the whole job, litres. */
  spray: number;
  /** Fills, counting a part fill as one. */
  fills: number;
  /** Product in a full tank. */
  productPerFullTank: number;
  /** The last fill, when it is a part tank: litres of spray and product in it. */
  lastSpray: number;
  lastProduct: number;
  /** Hectares one full tank covers. */
  haPerTank: number;
};

/** What goes in the tank: area in hectares, dose and water volume per hectare, tank in litres. */
export function tankMix(ha: number, dosePerHa: number, waterPerHa: number, tankL: number): TankMix | null {
  if (!(ha > 0 && dosePerHa > 0 && waterPerHa > 0 && tankL > 0)) return null;
  const spray = ha * waterPerHa;
  const product = ha * dosePerHa;
  const haPerTank = tankL / waterPerHa;
  // A hair under a whole number of tanks is a whole number (floating point).
  const exact = spray / tankL;
  const fills = Math.ceil(exact - 1e-9);
  const lastSpray = spray - (fills - 1) * tankL;
  return {
    product,
    spray,
    fills,
    productPerFullTank: haPerTank * dosePerHa,
    lastSpray,
    lastProduct: (lastSpray / waterPerHa) * dosePerHa,
    haPerTank,
  };
}

/** A knapsack fill: millilitres (or grams) of product, and the square metres it covers. */
export function knapsack(dosePerHa: number, waterPerHa: number, fillL: number): { productMl: number; m2: number } | null {
  if (!(dosePerHa > 0 && waterPerHa > 0 && fillL > 0)) return null;
  const ha = fillL / waterPerHa;
  return { productMl: ha * dosePerHa * 1000, m2: ha * M2_PER_HA };
}

/**
 * The calibration formula every sprayer course teaches:
 * litres per hectare = nozzle output (L/min) x 600 / (speed km/h x nozzle spacing m).
 */
export function litresPerHa(nozzleLMin: number, kmh: number, spacingM: number): number | null {
  if (!(nozzleLMin > 0 && kmh > 0 && spacingM > 0)) return null;
  return (nozzleLMin * 600) / (kmh * spacingM);
}

/** The same formula turned round: the output each nozzle must give for a wanted volume. */
export function nozzleOutput(waterPerHa: number, kmh: number, spacingM: number): number | null {
  if (!(waterPerHa > 0 && kmh > 0 && spacingM > 0)) return null;
  return (waterPerHa * kmh * spacingM) / 600;
}

/** Forward speed from the seconds taken to cover 100 metres. */
export function kmhFrom100m(seconds: number): number | null {
  return seconds > 0 ? 360 / seconds : null;
}

/** Up to three significant figures, no trailing zeros: 0.125, 12.5, 125, 1,250. */
export function fig(n: number): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return Number(n.toFixed(dp)).toLocaleString('en-GB', { maximumFractionDigits: dp });
}
