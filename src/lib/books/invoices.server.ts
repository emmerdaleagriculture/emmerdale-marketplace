/**
 * Invoices: loading, issuing, voiding and recording payments. The ledger
 * entries go through books_post_entry / books_record_invoice_payment, so an
 * issue is idempotent (external_id inv:<ledger>:<number>) and a payment can
 * never exceed what is due or be recorded twice.
 */

import { randomBytes } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import type { Database, Json } from '@/lib/database.types';
import { issuePosting, paymentPosting, voidPosting, type InvoiceLine, type PaymentMethod } from './invoice';
import type { Line } from './posting';
import { personalAccountCode, type BusinessType } from './chart';
import { todayUk } from './period';
import { registeredOn } from './vat';
import type { Ledger } from './server';

export type Invoice = Database['public']['Tables']['books_invoices']['Row'];
export type Customer = Database['public']['Tables']['books_customers']['Row'];
export type InvoiceLineRow = Database['public']['Tables']['books_invoice_lines']['Row'];
export type InvoiceFull = Invoice & {
  customer: Customer;
  lines: InvoiceLineRow[];
  payments: Database['public']['Tables']['books_invoice_payments']['Row'][];
  events: Database['public']['Tables']['books_invoice_events']['Row'][];
};

export function newPublicToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function loadInvoice(ledgerId: string, id: number): Promise<InvoiceFull | null> {
  const admin = createServiceRoleClient();
  const { data: inv } = await admin.from('books_invoices').select('*').eq('id', id).eq('ledger_id', ledgerId).maybeSingle();
  if (!inv) return null;
  return withParts(inv);
}

export async function loadInvoiceByToken(token: string): Promise<(InvoiceFull & { ledger: Ledger }) | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const admin = createServiceRoleClient();
  const { data: inv } = await admin.from('books_invoices').select('*').eq('public_token', token).maybeSingle();
  if (!inv || inv.status === 'draft' || inv.status === 'void') return null;
  const { data: ledger } = await admin.from('books_ledgers').select('*').eq('id', inv.ledger_id).maybeSingle();
  if (!ledger) return null;
  return { ...(await withParts(inv)), ledger: ledger as Ledger };
}

async function withParts(inv: Invoice): Promise<InvoiceFull> {
  const admin = createServiceRoleClient();
  const [{ data: customer }, { data: lines }, { data: payments }, { data: events }] = await Promise.all([
    admin.from('books_customers').select('*').eq('id', inv.customer_id).single(),
    admin.from('books_invoice_lines').select('*').eq('invoice_id', inv.id).order('position'),
    admin.from('books_invoice_payments').select('*').eq('invoice_id', inv.id).order('paid_on'),
    admin.from('books_invoice_events').select('*').eq('invoice_id', inv.id).order('at'),
  ]);
  return { ...inv, customer: customer as Customer, lines: lines ?? [], payments: payments ?? [], events: events ?? [] };
}

function asLines(rows: InvoiceLineRow[]): InvoiceLine[] {
  return rows.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unit_pence: l.unit_pence,
    vat_code: l.vat_code,
    account_code: l.account_code,
    net_pence: l.net_pence,
    vat_pence: l.vat_pence,
  }));
}

/** Issue a draft: lock it and post the sale. Returns an error message or null. */
export async function issueInvoice(inv: InvoiceFull): Promise<string | null> {
  if (inv.status !== 'draft') return null;
  if (!inv.lines.length || inv.gross_pence <= 0) return 'Add at least one line with an amount before issuing.';
  const admin = createServiceRoleClient();
  // VAT was worked out when the draft was saved. If registration has changed
  // since (for the issue date), the lines are wrong: make them save again.
  const { data: l } = await admin.from('books_ledgers').select('vat_registered, vat_registration_date, vat_scheme').eq('id', inv.ledger_id).single();
  const registeredNow = Boolean(l && registeredOn({ vat_registered: l.vat_registered, vat_registration_date: l.vat_registration_date, vat_scheme: l.vat_scheme as 'standard' }, inv.issue_date));
  const pricedRegistered = inv.lines.some((x) => x.vat_code !== 'NOVAT');
  if (registeredNow !== pricedRegistered) {
    return 'Your VAT registration has changed since this draft was saved. Open it with Edit and save it again to update the VAT.';
  }
  const p = issuePosting({
    id: inv.id,
    ledger_id: inv.ledger_id,
    number: inv.number,
    issue_date: inv.issue_date,
    customer_name: inv.customer.organisation || inv.customer.name,
    lines: asLines(inv.lines),
  });
  const { data: entryId, error } = await admin.rpc('books_post_entry', {
    p_ledger_id: inv.ledger_id,
    p_entry: p.entry as unknown as Json,
    p_lines: p.lines as unknown as Json,
  });
  if (error || entryId == null) {
    console.error('[books] issue failed', { invoice: inv.id, error: error?.message });
    return 'The invoice couldn’t be issued. Check its lines and try again.';
  }
  const { error: upErr } = await admin
    .from('books_invoices')
    .update({ status: 'issued', entry_id: entryId })
    .eq('id', inv.id)
    .eq('status', 'draft');
  if (upErr) return 'The invoice couldn’t be issued. Please try again.';
  return null;
}

/** Void: a draft is deleted; an issued invoice with no payments has its sale reversed. */
export async function voidInvoice(inv: InvoiceFull): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (inv.status === 'draft') {
    await admin.from('books_invoices').delete().eq('id', inv.id).eq('status', 'draft');
    return null;
  }
  if (inv.status === 'void') return null;
  if (inv.paid_pence > 0 || inv.payments.length) return 'An invoice with payments can’t be voided.';
  // Claim it first: only an issued invoice with nothing paid can be voided,
  // and a payment recorded meanwhile (books_record_invoice_payment refuses a
  // void invoice) can't land on it afterwards.
  const { data: claimed } = await admin
    .from('books_invoices')
    .update({ status: 'void' })
    .eq('id', inv.id)
    .eq('status', 'issued')
    .eq('paid_pence', 0)
    .select('id');
  if (!claimed?.length) return 'This invoice has just been paid or changed. Refresh and try again.';
  const undo = () => admin.from('books_invoices').update({ status: 'issued' }).eq('id', inv.id).eq('status', 'void');
  const { data: issueLines } = await admin
    .from('books_lines')
    .select('debit_pence, credit_pence, memo, books_accounts(code)')
    .eq('entry_id', inv.entry_id ?? -1);
  const lines: Line[] = (issueLines ?? []).map((l) => ({
    code: (l.books_accounts as unknown as { code: string }).code,
    debit: l.debit_pence,
    credit: l.credit_pence,
    memo: l.memo ?? undefined,
  }));
  if (!lines.length) {
    await undo();
    return 'The invoice’s ledger entry is missing, so it can’t be reversed.';
  }
  const p = voidPosting(
    { id: inv.id, ledger_id: inv.ledger_id, number: inv.number, issue_date: inv.issue_date, customer_name: inv.customer.organisation || inv.customer.name, lines: asLines(inv.lines) },
    lines,
    todayUk(),
  );
  const { error } = await admin.rpc('books_post_entry', {
    p_ledger_id: inv.ledger_id,
    p_entry: p.entry as unknown as Json,
    p_lines: p.lines as unknown as Json,
  });
  if (error) {
    await undo();
    return 'The invoice couldn’t be voided. Please try again.';
  }
  return null;
}

/** Record a payment against an issued invoice. */
export async function recordPayment(
  ledger: Ledger,
  inv: InvoiceFull,
  p: { paid_on: string; amount_pence: number; method: PaymentMethod; reference: string | null; external_id: string | null; into?: string },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const posting = paymentPosting(
    { id: inv.id, number: inv.number, customer_name: inv.customer.organisation || inv.customer.name },
    p,
    personalAccountCode(ledger.business_type as BusinessType),
  );
  const { data, error } = await createServiceRoleClient().rpc('books_record_invoice_payment', {
    p_invoice_id: inv.id,
    p_paid_on: p.paid_on,
    p_amount_pence: p.amount_pence,
    p_method: p.method,
    p_reference: p.reference ?? '',
    p_external_id: p.external_id as string,
    p_entry: posting.entry as unknown as Json,
    p_lines: posting.lines as unknown as Json,
  });
  if (error || data == null) {
    const msg = error?.message ?? '';
    return { ok: false, error: msg.includes('more than is due') ? 'That’s more than is due on this invoice.' : 'The payment couldn’t be recorded. Please try again.' };
  }
  return { ok: true, id: data };
}

export async function addEvent(invoiceId: number, kind: string, extra: { message_id?: string | null; recipient?: string | null; detail?: string | null } = {}) {
  await createServiceRoleClient()
    .from('books_invoice_events')
    .insert({ invoice_id: invoiceId, kind, message_id: extra.message_id ?? null, recipient: extra.recipient ?? null, detail: extra.detail ?? null });
}

/** Existing invoice numbers for the books, for the next number. */
export async function invoiceNumbers(ledgerId: string): Promise<string[]> {
  const admin = createServiceRoleClient();
  const rows = await fetchAll<{ number: string }>((a, b) =>
    admin.from('books_invoices').select('number').eq('ledger_id', ledgerId).order('id').range(a, b),
  );
  return rows.map((r) => r.number);
}
