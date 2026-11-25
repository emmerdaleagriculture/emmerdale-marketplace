/**
 * Bank statement rows against the books (Tally 2.11 / 3.9). Pure: the
 * server loads what's in the books and hands it in.
 *
 *   imported  the row was booked from a statement before (same row key, or
 *             the bank's own transaction id on an imported entry)
 *   matched   the same amount is already on that account within 5 days
 *             (a Stripe payout, a receipt, an invoice payment…)
 *   covered   dated on or before the books' opening balances, which already
 *             include it: never booked, or the bank would count it twice
 *   new       not in the books: booked automatically on upload with the
 *             suggested account: a Monzo pot transfer → 1205, money in that
 *             is exactly an open invoice's amount due → that invoice, else
 *             what this payee went to last time, else the AI's pick (or 4900 /
 *             6990) flagged to check. A Stripe payout on a ledger Stripe
 *             syncs waits for the sync, until a sync has run since without
 *             booking it (another Stripe account's): then it is sales.
 */

import { VAT_CODES, registeredOn, type VatCode } from './vat';
import { vatInGross } from './money';
import { buildPosting, validateDoc, type AccountInfo, type LedgerForPosting, type Posting } from './posting';
import { isPurchaseCategory, type AccountType } from './chart';
import { payeeKey, type BankRow } from './bankCsv';
import { bankAccountFromRule, ruleFor, type Rule } from './rules';

export const MATCH_DAYS = 5;
export const POTS_CODE = '1205';

/** What an imported row's entry is keyed by; an invoice payment adds invpay: in front. */
export const rowExternalId = (accountCode: string, key: string) => `bank:${accountCode}:${key}`;

/** A line on the statement's account already in the books. Amount: + in, − out. */
export type BookLine = {
  entry_id: number;
  date: string;
  amount: number;
  external_id: string | null;
  source: string;
  counterparty: string | null;
  description: string | null;
};

export type RowState =
  | { status: 'imported'; entryId: number }
  | { status: 'matched'; entryId: number; label: string }
  | { status: 'covered' }
  | { status: 'new' };

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Each row's state, and which book lines the statement accounts for. A book
 * line matches at most one row (the nearest date wins); a row imported
 * earlier is tied to its own entry by key. With opening balances at a date,
 * rows up to that date are covered by them, and entries up to it (summed up
 * into the opening balances too) match nothing later.
 */
export function classify(
  rows: BankRow[],
  accountCode: string,
  lines: BookLine[],
  openingAt: string | null = null,
): { states: RowState[]; usedEntries: Set<number> } {
  const byExt = new Map<string, BookLine>();
  for (const l of lines) if (l.external_id) byExt.set(l.external_id, l);
  const used = new Set<number>();
  const states: RowState[] = rows.map((r) => {
    const ext = rowExternalId(accountCode, r.key);
    // Entries imported from another system keep the bank's id (Monzo mm_…).
    const bankId = r.key.startsWith('id:') ? r.key.slice(3) : null;
    const hit = byExt.get(ext) ?? byExt.get(`invpay:${ext}`) ?? (bankId ? byExt.get(bankId) : undefined);
    if (hit) {
      used.add(hit.entry_id);
      return { status: 'imported', entryId: hit.entry_id };
    }
    return openingAt && r.date <= openingAt ? { status: 'covered' } : { status: 'new' };
  });
  // Entries from a statement row are never matched to a different row.
  const fromStatements = (l: BookLine) => /^(invpay:)?bank:/.test(l.external_id ?? '');
  rows.forEach((r, i) => {
    if (states[i].status !== 'new') return;
    let best: BookLine | null = null;
    for (const l of lines) {
      if (used.has(l.entry_id) || fromStatements(l) || l.amount !== r.amount) continue;
      if (openingAt && l.date <= openingAt) continue;
      const d = dayDiff(l.date, r.date);
      if (d > MATCH_DAYS) continue;
      if (!best || d < dayDiff(best.date, r.date)) best = l;
    }
    if (best) {
      used.add(best.entry_id);
      states[i] = { status: 'matched', entryId: best.entry_id, label: [best.counterparty, best.description].filter(Boolean).join(' · ') || 'Entry' };
    }
  });
  return { states, usedEntries: used };
}

export type OpenInvoice = { id: number; number: string; customer: string; due_pence: number; issue_date: string };
export type PayeeHistory = Map<string, { account: string; vat: VatCode }>;

/** fixed: a flagged guess that is ours to make, not one to ask the AI about. */
export type Suggestion = { account: string; vat: VatCode; check: boolean; why: string; fixed?: boolean };

/** Money in from Stripe: a payout of card payments. */
export const isStripePayout = (r: BankRow) => r.amount > 0 && /\bstripe\b/i.test(r.payee);

/**
 * Whether the Stripe sync may still book a payout row. It books a payout the
 * day Stripe sends it, which is on or before the day the bank shows it; so
 * once a sync has run on a later day and the row still matches nothing, the
 * payout isn't from the connected Stripe account and nothing else will book it.
 */
export const payoutDue = (r: BankRow, syncedOn: string | null) => !syncedOn || syncedOn <= r.date;

const isPot = (r: BankRow) => /pot transfer/i.test(r.type ?? '') || /^(savings )?pot\b/i.test(r.payee);

/** A suggested account and VAT code for each new row (null for the others). */
export function suggest(
  rows: BankRow[],
  states: RowState[],
  ctx: {
    registered: (date: string) => boolean;
    history: PayeeHistory;
    invoices: OpenInvoice[];
    accounts: Map<string, AccountInfo>;
    rules?: Rule[];
  },
): (Suggestion | null)[] {
  const invoicesLeft = [...ctx.invoices].sort((a, b) => a.issue_date.localeCompare(b.issue_date));
  return rows.map((r, i) => {
    if (states[i].status !== 'new') return null;
    const reg = ctx.registered(r.date);
    const plainVat: VatCode = reg ? 'STD' : 'NOVAT';
    if (isPot(r) && ctx.accounts.has(POTS_CODE)) return { account: POTS_CODE, vat: 'OUTSIDE', check: false, why: 'Pot transfer' };
    if (r.amount > 0) {
      const j = invoicesLeft.findIndex((inv) => inv.due_pence === r.amount && inv.issue_date <= r.date);
      if (j >= 0) {
        const inv = invoicesLeft.splice(j, 1)[0];
        return { account: `inv:${inv.id}`, vat: 'OUTSIDE', check: false, why: `Pays invoice ${inv.number}` };
      }
    }
    const rule = ruleFor(ctx.rules ?? [], `${r.payee} ${r.description}`, r.amount);
    const ruleAcc = rule && bankAccountFromRule(rule, r.amount);
    if (rule && ruleAcc && ctx.accounts.has(ruleAcc)) {
      const v = rule.vat_code && ruleAcc === rule.account_code ? rule.vat_code : plainVat;
      const vat: VatCode = !reg && v !== 'OUTSIDE' && v !== 'EXEMPT' ? 'NOVAT' : reg && v === 'NOVAT' ? 'STD' : v;
      return { account: ruleAcc, vat, check: false, why: `Your rule: “${rule.match_text}”` };
    }
    const h = ctx.history.get(payeeKey(r.payee));
    if (h && ctx.accounts.has(h.account)) {
      // VAT as last time, unless registration changed in between.
      const vat = !reg && h.vat !== 'OUTSIDE' && h.vat !== 'EXEMPT' ? 'NOVAT' : reg && h.vat === 'NOVAT' ? 'STD' : h.vat;
      return { account: h.account, vat, check: false, why: 'As last time' };
    }
    // A payout no Stripe sync accounts for: the card sales behind it, less Stripe's fees.
    if (isStripePayout(r) && ctx.accounts.has('4000')) {
      return { account: '4000', vat: plainVat, check: true, fixed: true, why: 'A Stripe payout your books had no sales for: booked as sales' };
    }
    return r.amount > 0
      ? { account: '4900', vat: plainVat, check: true, why: 'Check this' }
      : { account: '6990', vat: plainVat, check: true, why: 'Check this' };
  });
}

export type Choice = { account: string; vat: VatCode };

/**
 * The entry for one row booked to an account (Tally 3.9):
 *  - out to an expense or fixed asset: a purchase, VAT worked out from the
 *    total at the chosen rate (reclaimed if registered);
 *  - in to an income account: a sale;
 *  - the other way round (a refund from a supplier, to a customer): the same
 *    entry mirrored, so it reduces that account and the VAT boxes;
 *  - anything else (pots, the owner's account, transfers, HMRC): a journal
 *    between the bank and that account, outside the scope of VAT.
 */
export function rowPosting(
  row: BankRow,
  choice: Choice,
  bankCode: string,
  ledger: LedgerForPosting,
  accounts: Map<string, AccountInfo & { name?: string; type: AccountType }>,
  statementId: number,
): Posting | { error: string } {
  const acc = accounts.get(choice.account);
  if (!acc) return { error: 'Choose an account.' };
  if (choice.account === bankCode) return { error: 'Choose an account other than the statement’s own.' };
  const gross = Math.abs(row.amount);
  const inn = row.amount > 0;
  const external_id = rowExternalId(bankCode, row.key);
  const meta = { payee: payeeKey(row.payee), statement_id: statementId };
  const description = [row.payee, row.description].filter(Boolean).join(' · ').slice(0, 500);

  const pnl = isPurchaseCategory(acc) || acc.type === 'income';
  if (!pnl) {
    return {
      entry: {
        entry_date: row.date,
        kind: 'journal',
        source: 'bank',
        counterparty: row.payee,
        reference: null,
        description,
        vat_code: 'OUTSIDE',
        net_pence: gross,
        vat_pence: 0,
        gross_pence: gross,
        is_capital: false,
        external_id,
        meta,
      },
      lines: inn
        ? [
            { code: bankCode, debit: gross, credit: 0 },
            { code: choice.account, debit: 0, credit: gross },
          ]
        : [
            { code: choice.account, debit: gross, credit: 0 },
            { code: bankCode, debit: 0, credit: gross },
          ],
    };
  }

  const kind = acc.type === 'income' ? 'sale' : 'purchase';
  const mirror = (kind === 'purchase') === inn;
  const reg = registeredOn(ledger, row.date);
  const vatCode: VatCode = choice.vat;
  const rate = VAT_CODES[vatCode]?.rate ?? 0;
  const vat = reg && (vatCode === 'STD' || vatCode === 'RED') ? vatInGross(gross, rate) : 0;
  const doc = {
    kind,
    date: row.date,
    counterparty: row.payee,
    reference: null,
    description,
    currency: ledger.base_currency,
    net: gross - vat,
    vat,
    gross,
    vatCode,
    accountCode: choice.account,
    paymentCode: bankCode,
  } as const;
  const errs = validateDoc(doc, ledger, accounts);
  if (errs.length) return { error: errs[0] };
  const p = buildPosting(doc, ledger, accounts, 'bank');
  p.entry.external_id = external_id;
  p.entry.meta = mirror ? { ...meta, refund: true } : meta;
  if (!mirror) return p;
  return {
    entry: {
      ...p.entry,
      description: `Refund: ${description}`.slice(0, 500),
      net_pence: -p.entry.net_pence,
      vat_pence: -p.entry.vat_pence,
      gross_pence: -p.entry.gross_pence,
    },
    lines: p.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}

/**
 * The first day a statement is compared with the books from: its own first
 * day, or the day after the opening balances when they fall inside it.
 */
export const compareFrom = (start: string, openingAt: string | null) => {
  if (!openingAt || openingAt < start) return start;
  const d = new Date(`${openingAt}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Statement against books for the dates compared (rows the opening balances cover are left out). */
export function reconcile(
  rows: BankRow[],
  states: RowState[],
  lines: BookLine[],
  usedEntries: Set<number>,
  range: { start: string; end: string },
) {
  const inRange = lines.filter((l) => l.date >= range.start && l.date <= range.end);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const live = rows.filter((_, i) => states[i].status !== 'covered');
  return {
    statementIn: sum(live.filter((r) => r.amount > 0).map((r) => r.amount)),
    statementOut: sum(live.filter((r) => r.amount < 0).map((r) => -r.amount)),
    booksIn: sum(inRange.filter((l) => l.amount > 0).map((l) => l.amount)),
    booksOut: sum(inRange.filter((l) => l.amount < 0).map((l) => -l.amount)),
    notInBooks: rows.filter((_, i) => states[i].status === 'new').length,
    notOnStatement: inRange.filter((l) => !usedEntries.has(l.entry_id)),
  };
}
