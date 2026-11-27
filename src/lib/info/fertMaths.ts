import { ACRES_PER_HA } from './sprayMaths';

/**
 * The sums behind /info/fertiliser and /info/seeding. Pure and tested.
 *
 * A "unit" is the old measure still used in the yard: 1% of a hundredweight,
 * 1.12 lb or 0.508 kg of nutrient (RB209 Section 3 rounds it: 100 kg/ha =
 * 80 units an acre). Units per acre x 1.2553 = kg per hectare.
 * A bag marked 20-10-10 is 20% N, 10% P2O5 and 10% K2O by weight.
 */

export const KG_PER_UNIT = 0.50802345;
export const KG_HA_PER_UNIT_ACRE = KG_PER_UNIT * ACRES_PER_HA;

export const unitsPerAcre = (kgPerHa: number) => kgPerHa / KG_HA_PER_UNIT_ACRE;
export const kgHaFromUnits = (units: number) => units * KG_HA_PER_UNIT_ACRE;

export type Analysis = { n: number; p: number; k: number };

/** Common UK grades, as printed on the bag (N-P2O5-K2O). */
export const GRADES: { name: string; a: Analysis }[] = [
  { name: 'Ammonium nitrate 34.5% N', a: { n: 34.5, p: 0, k: 0 } },
  { name: 'CAN 27% N', a: { n: 27, p: 0, k: 0 } },
  { name: 'Urea 46% N', a: { n: 46, p: 0, k: 0 } },
  { name: '20-10-10', a: { n: 20, p: 10, k: 10 } },
  { name: '16-16-16', a: { n: 16, p: 16, k: 16 } },
  { name: '0-24-24', a: { n: 0, p: 24, k: 24 } },
  { name: 'Triple superphosphate 46% P₂O₅', a: { n: 0, p: 46, k: 0 } },
  { name: 'Muriate of potash 60% K₂O', a: { n: 0, p: 0, k: 60 } },
];

/** Product needed (kg/ha) to put on `kgPerHa` of a nutrient the product is `pct` percent of. */
export function productRate(kgPerHa: number, pct: number): number | null {
  if (!(kgPerHa > 0 && pct > 0 && pct <= 100)) return null;
  return (kgPerHa * 100) / pct;
}

/** What a rate of product (kg/ha) supplies of each nutrient, kg/ha. */
export function supplied(productKgHa: number, a: Analysis): Analysis | null {
  if (!(productKgHa > 0)) return null;
  return { n: (productKgHa * a.n) / 100, p: (productKgHa * a.p) / 100, k: (productKgHa * a.k) / 100 };
}

/** Product for a field, and the bags that is. */
export function forArea(productKgHa: number, ha: number, bagKg: number): { kg: number; bags: number; wholeBags: number } | null {
  if (!(productKgHa > 0 && ha > 0 && bagKg > 0)) return null;
  const kg = productKgHa * ha;
  return { kg, bags: kg / bagKg, wholeBags: Math.ceil(kg / bagKg - 1e-9) };
}
