/**
 * Books money: every amount is whole pence (integers), rounded half-up to the
 * nearest penny wherever a rate is applied. Never floats for stored values.
 */

/** Integer division rounding half away from zero: roundDiv(5, 10) = 1, roundDiv(-5, 10) = -1. */
export function roundDiv(n: number, d: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error('roundDiv: integers only');
  const sign = Math.sign(n) * Math.sign(d);
  const a = Math.abs(n);
  const b = Math.abs(d);
  return sign * Math.floor((2 * a + b) / (2 * b));
}

/** VAT on a net amount at a whole-percent rate, half-up: 1000p at 20% → 200p. */
export function vatOnNet(netPence: number, ratePercent: number): number {
  return roundDiv(netPence * ratePercent, 100);
}

/** The VAT inside a gross amount at a whole-percent rate: £1.20 at 20% → 20p. */
export function vatInGross(grossPence: number, ratePercent: number): number {
  if (ratePercent === 0) return 0;
  return roundDiv(grossPence * ratePercent, 100 + ratePercent);
}

/**
 * Parse what someone typed as pounds ("1,234.56", "£12", "12.5", "-3") into
 * pence. More than two decimals round half-up. Blank or junk → null.
 */
export function parsePounds(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const s = String(input).trim().replace(/[£,\s]/g, '');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const padded = (frac + '000').slice(0, 3);
  let pence = Number(whole || '0') * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) pence += 1;
  if (!Number.isSafeInteger(pence)) return null;
  return neg ? -pence : pence;
}

/** £1,234.56, with a real minus sign for negatives. */
export function formatPence(pence: number, { blankZero = false }: { blankZero?: boolean } = {}): string {
  if (blankZero && pence === 0) return '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100).toLocaleString('en-GB');
  const p = String(abs % 100).padStart(2, '0');
  return `${pence < 0 ? '−' : ''}£${pounds}.${p}`;
}

/** Plain decimal for CSVs and form defaults: 123456 → "1234.56". */
export function penceToDecimal(pence: number): string {
  const abs = Math.abs(pence);
  return `${pence < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
