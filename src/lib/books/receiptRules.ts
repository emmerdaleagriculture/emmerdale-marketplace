/**
 * The automatic posting rules for a read receipt (Tally spec 3.4), as pure
 * functions: turn the AI's answer into reviewed fields, then gather every
 * reason it can't post on its own. No reasons → it posts automatically.
 * Notes are informational and never block.
 */

import type { ReceiptRead } from './receiptAi';
import { validateDoc, type AccountInfo, type LedgerForPosting, type PostableDoc } from './posting';
import { registeredOn, type VatCode } from './vat';
import { isIsoDate } from './period';

export const AUTO_POST_CONFIDENCE = 0.85;

export type ReceiptFields = {
  doc_type: 'purchase' | 'sale' | null;
  doc_date: string | null;
  counterparty: string | null;
  counterparty_vat_number: string | null;
  reference: string | null;
  description: string | null;
  currency: string | null;
  net_pence: number | null;
  vat_pence: number | null;
  gross_pence: number | null;
  vat_code: string | null;
  account_code: string | null;
  payment_account_code: string | null;
};

/** Pounds (as the AI gives them) to pence, half-up. */
export function toPence(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  // toFixed first: 1.005 * 100 is 100.49999… in floating point.
  const pence = Math.round(Math.abs(Number((n * 100).toFixed(6))));
  return n < 0 ? -pence : pence;
}

/** Fill whichever of net / VAT / gross is missing from the other two. */
export function completeAmounts(net: number | null, vat: number | null, gross: number | null) {
  if (gross == null && net != null) gross = net + (vat ?? 0);
  if (vat == null && gross != null && net != null) vat = gross - net;
  if (vat == null) vat = 0;
  if (net == null && gross != null) net = gross - vat;
  return { net, vat, gross };
}

export function fieldsFromRead(
  r: ReceiptRead,
  ledger: LedgerForPosting,
  accounts: Map<string, AccountInfo>,
  defaultPayment: string,
): ReceiptFields {
  const docType = r.document_type === 'sale' ? 'sale' : r.document_type === 'purchase' ? 'purchase' : null;
  const date = isIsoDate(r.document_date) ? r.document_date : null;
  const amounts = completeAmounts(toPence(r.net_amount), toPence(r.vat_amount), toPence(r.gross_amount));
  let account = r.account_code && accounts.has(r.account_code) ? r.account_code : null;
  if (docType === 'sale' && (!account || accounts.get(account)!.type !== 'income')) account = '4000';
  if (docType === 'purchase' && account) {
    const a = accounts.get(account)!;
    if (!(a.type === 'expense' || a.is_fixed_asset)) account = null;
  }
  let vatCode: string | null = r.vat_code;
  if (docType === 'sale' && date && !registeredOn(ledger, date) && vatCode !== 'EXEMPT' && vatCode !== 'OUTSIDE') {
    vatCode = 'NOVAT';
  }
  if (!vatCode) vatCode = (amounts.vat ?? 0) > 0 ? 'STD' : 'OUTSIDE';
  return {
    doc_type: docType,
    doc_date: date,
    counterparty: r.counterparty_name?.trim() || null,
    counterparty_vat_number: r.counterparty_vat_number?.replace(/\s+/g, '').toUpperCase() || null,
    reference: r.invoice_number?.trim() || null,
    description: r.description?.trim() || null,
    currency: (r.currency || 'GBP').toUpperCase(),
    net_pence: amounts.net,
    vat_pence: amounts.vat,
    gross_pence: amounts.gross,
    vat_code: vatCode,
    account_code: account,
    // Not paid yet: owed to us (debtors) or by us (creditors), not the bank.
    payment_account_code: r.is_paid === false ? (docType === 'sale' ? '1100' : '2100') : defaultPayment,
  };
}

/** The AI's confidence as 0–1; anything else (a percentage, NaN) counts as unsure. */
export function cleanConfidence(c: unknown): number {
  return typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1 ? c : 0;
}

export function docFromFields(f: ReceiptFields): PostableDoc {
  return {
    kind: f.doc_type ?? ('' as 'purchase'),
    date: f.doc_date ?? '',
    counterparty: f.counterparty,
    reference: f.reference,
    description: f.description,
    currency: f.currency,
    net: f.net_pence,
    vat: f.vat_pence,
    gross: f.gross_pence,
    vatCode: (f.vat_code ?? '') as VatCode,
    accountCode: f.account_code ?? '',
    paymentCode: f.payment_account_code ?? '',
  };
}

/** Every reason this receipt can't post on its own. */
export function blockingReasons(
  f: ReceiptFields,
  read: ReceiptRead,
  ledger: LedgerForPosting,
  accounts: Map<string, AccountInfo>,
  opts: { sameEntryExists: boolean; threshold?: number },
): string[] {
  const reasons: string[] = [];
  if (!read.is_financial_document || read.document_type === 'other') {
    return ['This doesn’t look like a receipt or invoice. Enter it by hand, or reject it.'];
  }
  if (!f.account_code) reasons.push('Choose a category: the AI wasn’t sure which account this belongs to.');
  for (const e of validateDoc(docFromFields(f), ledger, accounts)) {
    if (e === 'Choose a category.' && !f.account_code) continue;
    reasons.push(e);
  }
  const threshold = opts.threshold ?? AUTO_POST_CONFIDENCE;
  const confidence = cleanConfidence(read.confidence);
  if (confidence < threshold) {
    reasons.push(`The AI was only ${Math.round(confidence * 100)}% sure of what it read.`);
  }
  if (opts.sameEntryExists) reasons.push('An entry with the same date, total and type is already in your books. Is this a duplicate?');
  return reasons;
}
