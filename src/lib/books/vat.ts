/**
 * VAT codes (Tally spec 3.2) and when a business counts as VAT registered.
 */

export const VAT_CODES = {
  STD: { label: 'Standard rate (20%)', rate: 20 },
  RED: { label: 'Reduced rate (5%)', rate: 5 },
  ZERO: { label: 'Zero rated', rate: 0 },
  EXEMPT: { label: 'Exempt', rate: 0 },
  OUTSIDE: { label: 'Outside the scope / supplier not VAT registered', rate: 0 },
  RC: { label: 'Reverse charge (overseas services)', rate: 20 },
  BLOCKED: { label: 'VAT charged but not reclaimable (e.g. entertaining)', rate: 0 },
  NOVAT: { label: 'Sale by a business not VAT registered', rate: 0 },
  PREREG: { label: 'Pre-registration VAT reclaim', rate: 0 },
} as const;

export type VatCode = keyof typeof VAT_CODES;

/** Codes a person can pick on a purchase or sale form (PREREG is internal). */
export const PICKABLE_VAT_CODES: VatCode[] = ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'RC', 'BLOCKED', 'NOVAT'];

export function isVatCode(s: unknown): s is VatCode {
  return typeof s === 'string' && Object.prototype.hasOwnProperty.call(VAT_CODES, s);
}

export type VatSettings = {
  vat_registered: boolean;
  vat_registration_date: string | null;
  vat_scheme: 'standard' | 'cash' | 'flat_rate';
};

/** Registered on a date: ticked registered and the date is on or after registration (or none is set). */
export function registeredOn(l: VatSettings, isoDate: string): boolean {
  if (!l.vat_registered) return false;
  return !l.vat_registration_date || isoDate >= l.vat_registration_date;
}

/** Flat-rate fixed-asset purchases of £2,000 or more (VAT inc.) still reclaim input VAT. */
export const FLAT_RATE_CAPITAL_THRESHOLD_PENCE = 200_000;

/** Tidy a VAT number as typed: spaces gone, upper case, a leading GB kept. */
export function cleanVatNumber(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}
