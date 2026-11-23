/**
 * The owner's rules (pure). "Payee or supplier contains X" decides where a
 * bank row or receipt goes, its VAT, and what pays it. A rule beats history
 * and the AI; the longest matching text wins, so "amazon prime" beats
 * "amazon".
 *
 * paid_from: 2300 = paid personally (director's loan / owner), 2100 = on
 * credit (invoices paid later). A bank payment to an on-credit supplier
 * clears 2100 rather than booking the cost a second time.
 */

import type { VatCode } from './vat';

export type Rule = {
  id: number;
  match_text: string;
  direction: 'any' | 'in' | 'out';
  account_code: string | null;
  vat_code: VatCode | null;
  paid_from: string | null;
};

export const CREDITORS = '2100';
export const DEBTORS = '1100';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The rule for this text (payee + description, or a supplier's name), if any. */
export function ruleFor(rules: Rule[], text: string, amount?: number): Rule | null {
  const t = ` ${norm(text)} `;
  let best: Rule | null = null;
  for (const r of rules) {
    const m = norm(r.match_text);
    if (!m || !t.includes(m)) continue;
    if (amount != null && ((r.direction === 'in' && amount <= 0) || (r.direction === 'out' && amount >= 0))) continue;
    if (!best || m.length > norm(best.match_text).length) best = r;
  }
  return best;
}

/** Where a bank row a rule matches goes: an on-credit supplier's payment clears creditors (a customer's, debtors). */
export function bankAccountFromRule(r: Rule, amount: number): string | null {
  if (r.paid_from === CREDITORS && amount < 0) return CREDITORS;
  if (r.paid_from === DEBTORS && amount > 0) return DEBTORS;
  return r.account_code;
}
