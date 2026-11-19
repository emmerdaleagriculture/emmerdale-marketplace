/**
 * The posting engine (Tally spec 3.3): turn a purchase or sale into
 * balanced double-entry lines, after validating it. Pure functions; the
 * write itself is books_post_entry() in SQL, which re-checks the balance.
 */

import { FLAT_RATE_CAPITAL_THRESHOLD_PENCE, VAT_CODES, isVatCode, registeredOn, type VatCode, type VatSettings } from './vat';
import { vatOnNet } from './money';
import { isIsoDate } from './period';
import { isPaymentAccount, type AccountType, type BusinessType } from './chart';

export type Line = { code: string; debit: number; credit: number; memo?: string };

export type PostableDoc = {
  kind: 'purchase' | 'sale';
  date: string; // YYYY-MM-DD
  counterparty?: string | null;
  reference?: string | null;
  description?: string | null;
  currency?: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
  vatCode: string;
  accountCode: string; // category: expense / fixed asset for purchases, income for sales
  paymentCode: string; // bank, card, director's loan…
};

export type LedgerForPosting = VatSettings & { base_currency: string; business_type?: BusinessType };
export type AccountInfo = { code: string; type: AccountType; is_fixed_asset: boolean };

export type EntryPayload = {
  entry_date: string;
  kind: 'purchase' | 'sale' | 'journal';
  source: string;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  vat_code: VatCode;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  is_capital: boolean;
  receipt_id?: number | null;
  external_id?: string | null;
  meta?: Record<string, unknown>;
};

export type Posting = { entry: EntryPayload; lines: Line[] };

/** Every reason the document can't be posted; empty means it can. */
export function validateDoc(doc: PostableDoc, ledger: LedgerForPosting, accounts: Map<string, AccountInfo>): string[] {
  const errs: string[] = [];
  if (doc.kind !== 'purchase' && doc.kind !== 'sale') errs.push('Choose purchase or sale.');
  if (!isIsoDate(doc.date)) errs.push('Enter the date.');
  if (doc.gross == null) errs.push('Enter the total.');
  else if (doc.gross <= 0) errs.push('The total must be more than £0.00.');
  if (!isVatCode(doc.vatCode) || doc.vatCode === 'PREREG') errs.push('Choose a VAT code.');
  if ((doc.currency || ledger.base_currency) !== ledger.base_currency) {
    errs.push(`Amounts must be in ${ledger.base_currency}.`);
  }
  const net = doc.net ?? 0;
  const vat = doc.vat ?? 0;
  if (net < 0 || vat < 0) errs.push('Net and VAT can’t be negative.');
  if (doc.gross != null && doc.vatCode !== 'RC' && Math.abs(net + vat - doc.gross) > 1) {
    errs.push('Net + VAT must equal the total.');
  }
  if (vat > 0 && (doc.vatCode === 'ZERO' || doc.vatCode === 'EXEMPT' || doc.vatCode === 'OUTSIDE')) {
    errs.push(`There’s no VAT on a ${VAT_CODES[doc.vatCode].label.toLowerCase()} item: set VAT to £0 or change the code.`);
  }
  const cat = accounts.get(doc.accountCode);
  if (!cat) errs.push('Choose a category.');
  else if (doc.kind === 'purchase' && !(cat.type === 'expense' || cat.is_fixed_asset)) {
    errs.push('A purchase goes to an expense or fixed-asset account.');
  } else if (doc.kind === 'sale' && cat.type !== 'income') errs.push('A sale goes to an income account.');
  const pay = accounts.get(doc.paymentCode);
  if (!pay || (ledger.business_type && !isPaymentAccount(pay, ledger.business_type))) {
    errs.push('Choose what it was paid from or into.');
  } else if (doc.paymentCode === doc.accountCode) errs.push('The category and the payment account must differ.');
  return errs;
}

/**
 * Lines for a validated document. A business not registered on the date
 * still keeps the VAT on the entry (for a later pre-registration reclaim)
 * but books the gross to the category.
 */
export function buildPosting(
  doc: PostableDoc,
  ledger: LedgerForPosting,
  accounts: Map<string, AccountInfo>,
  source = 'manual',
): Posting {
  const gross = doc.gross ?? 0;
  const vat = doc.vat ?? 0;
  const net = doc.net ?? gross - vat;
  const registered = registeredOn(ledger, doc.date);
  const flat = ledger.vat_scheme === 'flat_rate';
  const cat = accounts.get(doc.accountCode)!;
  const isCapital = Boolean(cat?.is_fixed_asset);
  let vatCode = doc.vatCode as VatCode;
  if (doc.kind === 'sale' && !registered && vatCode !== 'EXEMPT' && vatCode !== 'OUTSIDE') vatCode = 'NOVAT';

  const lines: Line[] = [];
  let entryNet = net;
  let entryVat = vat;

  if (doc.kind === 'purchase') {
    const reclaimable =
      registered &&
      (vatCode === 'STD' || vatCode === 'RED') &&
      (!flat || (isCapital && gross >= FLAT_RATE_CAPITAL_THRESHOLD_PENCE));
    if (reclaimable && vat > 0) {
      // Net + VAT may be a penny off the total on the document; the category absorbs it.
      entryNet = gross - vat;
      lines.push({ code: doc.accountCode, debit: entryNet, credit: 0 });
      lines.push({ code: '2202', debit: vat, credit: 0, memo: 'Input VAT' });
      lines.push({ code: doc.paymentCode, debit: 0, credit: gross });
    } else if (vatCode === 'RC' && registered && !flat) {
      // Reverse charge: the supplier charged no VAT; we account for 20% both ways.
      entryNet = gross;
      entryVat = vatOnNet(gross, VAT_CODES.RC.rate);
      lines.push({ code: doc.accountCode, debit: gross, credit: 0 });
      lines.push({ code: '2202', debit: entryVat, credit: 0, memo: 'Reverse charge input VAT' });
      lines.push({ code: '2201', debit: 0, credit: entryVat, memo: 'Reverse charge output VAT' });
      lines.push({ code: doc.paymentCode, debit: 0, credit: gross });
    } else {
      lines.push({ code: doc.accountCode, debit: gross, credit: 0 });
      lines.push({ code: doc.paymentCode, debit: 0, credit: gross });
    }
  } else {
    if (registered && !flat && vat > 0 && vatCode !== 'NOVAT') {
      lines.push({ code: doc.paymentCode, debit: gross, credit: 0 });
      entryNet = gross - vat;
      lines.push({ code: doc.accountCode, debit: 0, credit: entryNet });
      lines.push({ code: '2201', debit: 0, credit: vat, memo: 'Output VAT' });
    } else {
      if (vatCode === 'NOVAT') {
        entryNet = gross;
        entryVat = 0;
      }
      lines.push({ code: doc.paymentCode, debit: gross, credit: 0 });
      lines.push({ code: doc.accountCode, debit: 0, credit: gross });
    }
  }

  return {
    entry: {
      entry_date: doc.date,
      kind: doc.kind,
      source,
      counterparty: doc.counterparty?.trim() || null,
      reference: doc.reference?.trim() || null,
      description: doc.description?.trim() || null,
      vat_code: vatCode,
      net_pence: entryNet,
      vat_pence: entryVat,
      gross_pence: gross,
      is_capital: isCapital,
    },
    lines,
  };
}

export function balances(lines: Line[]): boolean {
  const dr = lines.reduce((s, l) => s + l.debit, 0);
  const cr = lines.reduce((s, l) => s + l.credit, 0);
  return dr === cr && dr > 0 && lines.every((l) => l.debit >= 0 && l.credit >= 0);
}
