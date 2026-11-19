/**
 * Invoices (Tally 3.7), as pure functions: line amounts, numbering, and the
 * postings for issuing, being paid and voiding.
 */

import { roundDiv, vatOnNet } from './money';
import { VAT_CODES, type VatCode } from './vat';
import type { Line, Posting } from './posting';

export const INVOICE_VAT_CODES = ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE'] as const;

export type InvoiceLineInput = {
  description: string;
  quantity: number; // up to 3 decimals
  unit_pence: number;
  vat_code: string;
  account_code: string;
};

export type InvoiceLine = InvoiceLineInput & { net_pence: number; vat_pence: number };

/**
 * net = quantity × unit price, rounded half-up; VAT at the line's rate if the
 * business is registered on the issue date, otherwise none and NOVAT.
 */
export function priceLine(l: InvoiceLineInput, registered: boolean): InvoiceLine {
  const milli = Math.round(l.quantity * 1000);
  const net = roundDiv(milli * l.unit_pence, 1000);
  if (!registered) return { ...l, vat_code: 'NOVAT', net_pence: net, vat_pence: 0 };
  const code = (INVOICE_VAT_CODES as readonly string[]).includes(l.vat_code) ? (l.vat_code as VatCode) : 'STD';
  return { ...l, vat_code: code, net_pence: net, vat_pence: vatOnNet(net, VAT_CODES[code].rate) };
}

export function invoiceTotals(lines: InvoiceLine[]) {
  const net = lines.reduce((t, l) => t + l.net_pence, 0);
  const vat = lines.reduce((t, l) => t + l.vat_pence, 0);
  return { net_pence: net, vat_pence: vat, gross_pence: net + vat };
}

/** One more than the highest number used so far, zero-padded to 7 digits. */
export function nextInvoiceNumber(existing: string[]): string {
  let max = 0;
  for (const n of existing) if (/^\d+$/.test(n)) max = Math.max(max, Number(n));
  return String(max + 1).padStart(7, '0');
}

export function amountDue(inv: { status: string; gross_pence: number; paid_pence: number }): number {
  return inv.status === 'void' || inv.status === 'draft' ? 0 : Math.max(0, inv.gross_pence - inv.paid_pence);
}

export function isOverdue(inv: { status: string; due_date: string; gross_pence: number; paid_pence: number }, today: string): boolean {
  return inv.status === 'issued' && amountDue(inv) > 0 && inv.due_date < today;
}

type InvoiceForPosting = {
  id: number;
  ledger_id: string;
  number: string;
  issue_date: string;
  customer_name: string;
  lines: InvoiceLine[];
};

/** The overall VAT code for the entry: the lines' code if they agree, else STD if any VAT, else the first. */
function entryVatCode(lines: InvoiceLine[]): VatCode {
  const codes = [...new Set(lines.map((l) => l.vat_code))];
  if (codes.length === 1) return codes[0] as VatCode;
  return lines.some((l) => l.vat_pence > 0) ? 'STD' : (codes[0] as VatCode);
}

/** Issue: Dr 1100 Debtors (gross), Cr each income account (net, grouped), Cr 2201 (VAT). */
export function issuePosting(inv: InvoiceForPosting): Posting {
  const t = invoiceTotals(inv.lines);
  const byAccount = new Map<string, number>();
  for (const l of inv.lines) byAccount.set(l.account_code, (byAccount.get(l.account_code) ?? 0) + l.net_pence);
  const lines: Line[] = [
    { code: '1100', debit: t.gross_pence, credit: 0, memo: `Invoice ${inv.number}` },
    ...[...byAccount].map(([code, net]) => ({ code, debit: 0, credit: net })),
    { code: '2201', debit: 0, credit: t.vat_pence, memo: 'Output VAT' },
  ].filter((l) => l.debit > 0 || l.credit > 0);
  return {
    entry: {
      entry_date: inv.issue_date,
      kind: 'sale',
      source: 'invoice',
      counterparty: inv.customer_name,
      reference: inv.number,
      description: `Invoice ${inv.number}`,
      vat_code: entryVatCode(inv.lines),
      net_pence: t.net_pence,
      vat_pence: t.vat_pence,
      gross_pence: t.gross_pence,
      is_capital: false,
      external_id: `inv:${inv.ledger_id}:${inv.number}`,
      meta: { invoice_id: inv.id },
    },
    lines,
  };
}

/**
 * Void an issued invoice: the exact reverse of its issue lines, dated today.
 * A negative sale with the original VAT code, so the VAT return takes the
 * sale and its VAT back out in the period it is voided.
 */
export function voidPosting(inv: InvoiceForPosting, issueLines: Line[], today: string): Posting {
  const t = invoiceTotals(inv.lines);
  return {
    entry: {
      entry_date: today,
      kind: 'sale',
      source: 'invoice',
      counterparty: inv.customer_name,
      reference: inv.number,
      description: `Invoice ${inv.number} voided`,
      vat_code: entryVatCode(inv.lines),
      net_pence: -t.net_pence,
      vat_pence: -t.vat_pence,
      gross_pence: -t.gross_pence,
      is_capital: false,
      external_id: `invvoid:${inv.id}`,
      meta: { invoice_id: inv.id },
    },
    lines: issueLines.map((l) => ({ code: l.code, debit: l.credit, credit: l.debit, memo: l.memo })),
  };
}

export const PAYMENT_METHODS = {
  bank: { label: 'Bank transfer', account: '1200' },
  stripe: { label: 'Card (Stripe)', account: '1220' },
  owner: { label: 'Paid to the owner personally', account: null },
  cash: { label: 'Cash', account: null },
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

/** Payment: Dr bank / Stripe / the owner's account, Cr 1100 Debtors. */
export function paymentPosting(
  inv: { id: number; number: string; customer_name: string },
  p: { paid_on: string; amount_pence: number; method: PaymentMethod; reference: string | null; external_id: string | null },
  ownerAccount: string,
): Posting {
  const into = PAYMENT_METHODS[p.method].account ?? ownerAccount;
  return {
    entry: {
      entry_date: p.paid_on,
      kind: 'journal',
      source: 'invoice',
      counterparty: inv.customer_name,
      reference: inv.number,
      description: `Payment for invoice ${inv.number}${p.reference ? ` (${p.reference})` : ''}`,
      vat_code: 'OUTSIDE',
      net_pence: p.amount_pence,
      vat_pence: 0,
      gross_pence: p.amount_pence,
      is_capital: false,
      external_id: p.external_id ? `invpay:${p.external_id}` : null,
      meta: { invoice_id: inv.id },
    },
    lines: [
      { code: into, debit: p.amount_pence, credit: 0 },
      { code: '1100', debit: 0, credit: p.amount_pence, memo: `Invoice ${inv.number}` },
    ],
  };
}
