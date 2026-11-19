/**
 * VAT (Tally spec 3.5 and 3.6), as pure functions over posted entries:
 * the nine-box return for a period, the registration-threshold monitor for a
 * business not yet registered, and which earlier purchases a newly
 * registered business can reclaim VAT on.
 *
 * The document date is used as both tax point and payment date (as Tally
 * does), so the cash scheme reports the same as standard for receipts.
 */

import { roundDiv } from './money';
import { FLAT_RATE_CAPITAL_THRESHOLD_PENCE } from './vat';

export type VatEntry = {
  id: number;
  entry_date: string;
  kind: 'purchase' | 'sale' | 'journal' | string;
  vat_code: string;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  is_capital: boolean;
  counterparty: string | null;
  description: string | null;
  /**
   * VAT actually posted: debits less credits on 2202 (input) and credits less
   * debits on 2201 (output). Boxes 1 and 4 use these when given, so the
   * return always agrees with the ledger: an entry posted before VAT
   * registration was ticked carries vat_pence but reclaimed nothing.
   */
  input_vat_pence?: number;
  output_vat_pence?: number;
};

export type Boxes = { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number; 7: number; 8: number; 9: number };
export type BoxContribution = Partial<Record<1 | 2 | 4 | 6 | 7, number>>;

export const BOX_LABELS: Record<keyof Boxes, string> = {
  1: 'VAT due on sales and other outputs',
  2: 'VAT due on acquisitions from the EU (Northern Ireland only)',
  3: 'Total VAT due (box 1 + box 2)',
  4: 'VAT reclaimed on purchases and other inputs',
  5: 'Net VAT to pay HMRC, or reclaim if negative (box 3 − box 4)',
  6: 'Total sales and other outputs, excluding VAT',
  7: 'Total purchases and other inputs, excluding VAT',
  8: 'Supplies of goods to the EU (Northern Ireland only)',
  9: 'Acquisitions of goods from the EU (Northern Ireland only)',
};

export type Scheme = { vat_scheme: 'standard' | 'cash' | 'flat_rate'; flat_rate_percent: number | null };

/** What one entry puts in each box, in pence. */
export function boxesFor(e: VatEntry, s: Scheme): BoxContribution {
  const flat = s.vat_scheme === 'flat_rate';
  const c = e.vat_code;
  const input = e.input_vat_pence ?? e.vat_pence;
  const output = e.output_vat_pence ?? e.vat_pence;
  if (e.kind === 'journal') return c === 'PREREG' ? { 4: input } : {};
  if (c === 'OUTSIDE' || c === 'NOVAT') return {};
  if (e.kind === 'sale') {
    if (flat) {
      // Flat rate: the percentage of the VAT-inclusive turnover, in hundredths of a percent.
      const bp = Math.round((s.flat_rate_percent ?? 0) * 100);
      return { 1: roundDiv(e.gross_pence * bp, 10_000), 6: e.gross_pence };
    }
    if (c === 'STD' || c === 'RED') return { 1: output, 6: e.net_pence };
    if (c === 'ZERO' || c === 'EXEMPT') return { 6: e.net_pence };
    return {};
  }
  if (e.kind === 'purchase') {
    if (c === 'RC') return flat ? { 7: e.net_pence } : { 1: output, 4: input, 6: e.net_pence, 7: e.net_pence };
    if (flat) {
      const capital = e.is_capital && e.gross_pence >= FLAT_RATE_CAPITAL_THRESHOLD_PENCE && (c === 'STD' || c === 'RED');
      return capital ? { 4: input, 7: e.net_pence } : { 7: e.net_pence };
    }
    if (c === 'STD' || c === 'RED') return { 4: input, 7: e.net_pence };
    if (c === 'ZERO' || c === 'EXEMPT' || c === 'BLOCKED') return { 7: e.net_pence };
  }
  return {};
}

/** Whole pounds, rounded down, kept in pence. */
const wholePounds = (p: number) => Math.floor(p / 100) * 100;

export function computeReturn(entries: VatEntry[], s: Scheme): { boxes: Boxes; detail: { entry: VatEntry; boxes: BoxContribution }[] } {
  const t = { 1: 0, 2: 0, 4: 0, 6: 0, 7: 0 };
  const detail: { entry: VatEntry; boxes: BoxContribution }[] = [];
  for (const e of entries) {
    const b = boxesFor(e, s);
    if (!Object.keys(b).length) continue;
    for (const [k, v] of Object.entries(b)) t[Number(k) as 1 | 2 | 4 | 6 | 7] += v ?? 0;
    detail.push({ entry: e, boxes: b });
  }
  const box3 = t[1] + t[2];
  return {
    boxes: { 1: t[1], 2: t[2], 3: box3, 4: t[4], 5: box3 - t[4], 6: wholePounds(t[6]), 7: wholePounds(t[7]), 8: 0, 9: 0 },
    detail,
  };
}

/**
 * Entries in a registered period whose VAT wasn't posted to the VAT accounts:
 * recorded before VAT registration was switched on (with a registration date
 * set earlier). Voiding and posting them again reclaims or charges the VAT.
 */
export function vatNotPosted(entries: VatEntry[], s: Scheme): VatEntry[] {
  if (s.vat_scheme === 'flat_rate') return [];
  return entries.filter((e) => {
    if (!(e.vat_code === 'STD' || e.vat_code === 'RED') || e.vat_pence <= 0) return false;
    if (e.kind === 'purchase') return (e.input_vat_pence ?? e.vat_pence) === 0;
    if (e.kind === 'sale') return (e.output_vat_pence ?? e.vat_pence) === 0;
    return false;
  });
}

// ── Quarters ────────────────────────────────────────────────────────────────

export type Period = { from: string; to: string; label: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * VAT quarters ending in the given month pattern (HMRC staggers them: ending
 * Mar/Jun/Sep/Dec, Jan/Apr/Jul/Oct or Feb/May/Aug/Nov). Newest first,
 * starting with the quarter containing `today`.
 */
export function quarters(today: string, stagger: 0 | 1 | 2, count: number): Period[] {
  const [y, m] = today.split('-').map(Number);
  // First quarter-end month on or after today's month in this stagger (1-12).
  let endM = m;
  while ((endM - 1 - stagger + 120) % 3 !== 2) endM += 1;
  let endY = y;
  if (endM > 12) {
    endM -= 12;
    endY += 1;
  }
  const out: Period[] = [];
  for (let i = 0; i < count; i++) {
    let startM = endM - 2;
    let startY = endY;
    if (startM < 1) {
      startM += 12;
      startY -= 1;
    }
    out.push({
      from: `${startY}-${String(startM).padStart(2, '0')}-01`,
      to: `${endY}-${String(endM).padStart(2, '0')}-${lastDay(endY, endM)}`,
      label: `${MONTHS[startM - 1]} ${startY === endY ? '' : `${startY} `}– ${MONTHS[endM - 1]} ${endY}`,
    });
    endM -= 3;
    if (endM < 1) {
      endM += 12;
      endY -= 1;
    }
  }
  return out;
}

// ── Not yet registered ──────────────────────────────────────────────────────

/** The VAT registration threshold (from 1 April 2024). */
export const VAT_THRESHOLD_PENCE = 9_000_000;

/** Taxable turnover: sales that would be taxable (standard, reduced, zero, or by an unregistered business). */
export function taxableTurnover(entries: VatEntry[]): number {
  return entries
    .filter((e) => e.kind === 'sale' && ['STD', 'RED', 'ZERO', 'NOVAT'].includes(e.vat_code))
    .reduce((t, e) => t + e.net_pence, 0);
}

export function thresholdState(turnover: number): 'under' | 'near' | 'over' {
  if (turnover >= VAT_THRESHOLD_PENCE) return 'over';
  if (turnover >= VAT_THRESHOLD_PENCE * 0.8) return 'near';
  return 'under';
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay(ny, nm))).padStart(2, '0')}`;
}

export type PreRegCandidate = VatEntry & { account_code: string; goods: boolean; eligible: boolean; why: string };

/**
 * Purchases with VAT before a registration date, and whether HMRC allows
 * the VAT back: goods (equipment, vehicles, stock and materials) bought in
 * the 4 years before, if still held; services in the 6 months before.
 */
export function preRegCandidates(
  purchases: (VatEntry & { account_code: string })[],
  registrationDate: string,
): PreRegCandidate[] {
  const goodsFrom = addMonths(registrationDate, -48);
  const servicesFrom = addMonths(registrationDate, -6);
  return purchases
    .filter((e) => e.kind === 'purchase' && e.vat_pence > 0 && e.entry_date < registrationDate && e.entry_date >= goodsFrom)
    .map((e) => {
      const goods = e.is_capital || e.account_code.startsWith('5');
      const codeOk = e.vat_code === 'STD' || e.vat_code === 'RED';
      let eligible = codeOk;
      let why = goods ? 'Goods: reclaimable if you still have them.' : 'Service within 6 months.';
      if (!codeOk) {
        eligible = false;
        why = 'VAT code doesn’t allow a reclaim.';
      } else if (!goods && e.entry_date < servicesFrom) {
        eligible = false;
        why = 'Service more than 6 months before registration.';
      }
      return { ...e, goods, eligible, why };
    })
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}
