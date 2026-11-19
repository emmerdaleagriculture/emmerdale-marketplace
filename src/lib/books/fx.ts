/**
 * Foreign-currency receipts are converted to pounds at the European Central
 * Bank reference rate for the document date (Frankfurter, free, no key; it
 * returns the previous working day's rate at weekends and holidays).
 */

export type FxRate = { rate: number; rateDate: string };

export async function gbpRate(currency: string, date: string): Promise<FxRate | null> {
  const cur = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (cur === 'GBP') return { rate: 1, rateDate: date };
  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${cur}&to=GBP`, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { date?: string; rates?: { GBP?: number } };
    const rate = body.rates?.GBP;
    if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
    return { rate, rateDate: body.date ?? date };
  } catch {
    return null;
  }
}

/** Convert pence in a foreign currency to pounds-pence at a rate, half-up. */
export function convertPence(pence: number | null, rate: number): number | null {
  if (pence == null) return null;
  return Math.round(pence * rate);
}
