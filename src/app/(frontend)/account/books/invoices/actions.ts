'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { requireBooksWriter, getAccounts } from '@/lib/books/server';
import { invoiceTotals, priceLine, PAYMENT_METHODS, type PaymentMethod } from '@/lib/books/invoice';
import { issueInvoice, loadInvoice, newPublicToken, recordPayment, voidInvoice } from '@/lib/books/invoices.server';
import { sendInvoiceEmail } from '@/lib/books/invoiceEmail';
import { parsePounds } from '@/lib/books/money';
import { isIsoDate, todayUk } from '@/lib/books/period';
import { registeredOn, cleanVatNumber } from '@/lib/books/vat';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const optional = (s: string) => (s === '' ? null : s);

function revalidate() {
  revalidatePath('/account/books', 'layout');
}

// ── Customers ───────────────────────────────────────────────────────────────

const CustomerSchema = z.object({
  name: z.string().min(1, 'Enter the customer’s name.').max(200),
  organisation: z.string().max(200),
  email: z.string().refine((s) => s === '' || z.string().email().safeParse(s).success, 'Enter a valid email address.'),
  phone: z.string().max(40),
  address: z.string().max(500),
  vat_number: z.string().max(20),
  notes: z.string().max(2000),
});

function readCustomer(fd: FormData, prefix = '') {
  return CustomerSchema.safeParse({
    name: str(fd, `${prefix}name`),
    organisation: str(fd, `${prefix}organisation`),
    email: str(fd, `${prefix}email`).toLowerCase(),
    phone: str(fd, `${prefix}phone`),
    address: str(fd, `${prefix}address`),
    vat_number: cleanVatNumber(str(fd, `${prefix}vat_number`)),
    notes: str(fd, `${prefix}notes`),
  });
}

const customerRow = (v: z.infer<typeof CustomerSchema>) => ({
  name: v.name,
  organisation: optional(v.organisation),
  email: optional(v.email),
  phone: optional(v.phone),
  address: optional(v.address),
  vat_number: optional(v.vat_number),
  notes: optional(v.notes),
});

export async function saveCustomerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const parsed = readCustomer(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  const id = Number(fd.get('customer_id'));
  const admin = createServiceRoleClient();
  if (Number.isSafeInteger(id) && id > 0) {
    const { error } = await admin.from('books_customers').update(customerRow(parsed.data)).eq('id', id).eq('ledger_id', gate.ledger.id);
    if (error) return { error: 'That didn’t save. Please try again.' };
    revalidate();
    return { ok: true, message: 'Saved.' };
  }
  const { error } = await admin.from('books_customers').insert({ ledger_id: gate.ledger.id, ...customerRow(parsed.data) });
  if (error) return { error: 'That didn’t save. Please try again.' };
  revalidate();
  redirect('/account/books/customers');
}

// ── Invoices ────────────────────────────────────────────────────────────────

const LineSchema = z.object({
  description: z.string().trim().min(1, 'Every line needs a description.').max(500),
  quantity: z.coerce.number().positive('Quantities must be more than 0.').max(1_000_000),
  unit: z.string(),
  vat_code: z.string(),
  account_code: z.string().regex(/^\d{4}$/),
});

/** Create or update a draft. */
export async function saveInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  const ledger = gate.ledger;
  if (!ledger) return { error: 'Set up your books first.' };
  const admin = createServiceRoleClient();

  const invoiceId = Number(fd.get('invoice_id'));
  const editing = Number.isSafeInteger(invoiceId) && invoiceId > 0;
  if (editing) {
    const { data: cur } = await admin.from('books_invoices').select('status').eq('id', invoiceId).eq('ledger_id', ledger.id).maybeSingle();
    if (!cur) return { error: 'That invoice isn’t in your books.' };
    if (cur.status !== 'draft') return { error: 'Only a draft can be changed.' };
  }

  const issueDate = str(fd, 'issue_date');
  const dueDate = str(fd, 'due_date');
  const number = str(fd, 'number');
  if (!isIsoDate(issueDate)) return { error: 'Enter the issue date.' };
  if (!isIsoDate(dueDate) || dueDate < issueDate) return { error: 'The due date must be on or after the issue date.' };
  if (!/^[A-Za-z0-9-]{1,20}$/.test(number)) return { error: 'An invoice number is letters, digits and dashes, up to 20.' };

  let rawLines: unknown;
  try {
    rawLines = JSON.parse(str(fd, 'lines') || '[]');
  } catch {
    return { error: 'Please check the lines.' };
  }
  const parsedLines = z.array(LineSchema).min(1, 'Add at least one line.').max(100).safeParse(rawLines);
  if (!parsedLines.success) return { error: parsedLines.error.issues[0]?.message ?? 'Please check the lines.' };
  const income = new Set((await getAccounts(ledger.id)).filter((a) => a.type === 'income').map((a) => a.code));
  const registered = registeredOn(
    { vat_registered: ledger.vat_registered, vat_registration_date: ledger.vat_registration_date, vat_scheme: ledger.vat_scheme as 'standard' },
    issueDate,
  );
  const lines = [];
  for (const l of parsedLines.data) {
    const unit = parsePounds(l.unit);
    if (unit == null || unit < 0) return { error: `Enter a price for “${l.description}”.` };
    if (!income.has(l.account_code)) return { error: 'Each line goes to an income account.' };
    lines.push(priceLine({ description: l.description, quantity: l.quantity, unit_pence: unit, vat_code: l.vat_code, account_code: l.account_code }, registered));
  }
  const totals = invoiceTotals(lines);

  // Customer: an existing one, or a new one from the inline fields.
  let customerId = Number(fd.get('customer_id'));
  if (!(Number.isSafeInteger(customerId) && customerId > 0)) {
    const c = readCustomer(fd, 'new_');
    if (!c.success) return { error: c.error.issues[0]?.message ?? 'Choose or add a customer.' };
    const { data: made, error } = await admin.from('books_customers').insert({ ledger_id: ledger.id, ...customerRow(c.data) }).select('id').single();
    if (error || !made) return { error: 'The customer couldn’t be saved. Please try again.' };
    customerId = made.id;
  } else {
    const { data: own } = await admin.from('books_customers').select('id').eq('id', customerId).eq('ledger_id', ledger.id).maybeSingle();
    if (!own) return { error: 'Choose a customer.' };
  }

  const row = { customer_id: customerId, number, issue_date: issueDate, due_date: dueDate, notes: optional(str(fd, 'notes')), ...totals };
  let id = invoiceId;
  if (editing) {
    const { error } = await admin.from('books_invoices').update(row).eq('id', id).eq('status', 'draft');
    if (error) return { error: error.code === '23505' ? `Invoice ${number} already exists.` : 'That didn’t save. Please try again.' };
    await admin.from('books_invoice_lines').delete().eq('invoice_id', id);
  } else {
    const { data: made, error } = await admin
      .from('books_invoices')
      .insert({ ledger_id: ledger.id, public_token: newPublicToken(), ...row })
      .select('id')
      .single();
    if (error || !made) return { error: error?.code === '23505' ? `Invoice ${number} already exists.` : 'That didn’t save. Please try again.' };
    id = made.id;
  }
  const { error: lineErr } = await admin
    .from('books_invoice_lines')
    .insert(lines.map((l, i) => ({ invoice_id: id, position: i + 1, description: l.description, quantity: l.quantity, unit_pence: l.unit_pence, vat_code: l.vat_code, account_code: l.account_code, net_pence: l.net_pence, vat_pence: l.vat_pence })));
  if (lineErr) return { error: 'The lines didn’t save. Please try again.' };
  revalidate();
  redirect(`/account/books/invoices/${id}`);
}

async function ownInvoice(fd: FormData) {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error } as const;
  if (!gate.ledger) return { error: 'Set up your books first.' } as const;
  const id = Number(fd.get('invoice_id'));
  const inv = Number.isSafeInteger(id) ? await loadInvoice(gate.ledger.id, id) : null;
  if (!inv) return { error: 'That invoice isn’t in your books.' } as const;
  return { ledger: gate.ledger, inv, userId: gate.userId } as const;
}

export async function issueInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await ownInvoice(fd);
  if ('error' in r) return { error: r.error };
  const err = await issueInvoice(r.inv);
  if (err) return { error: err };
  revalidate();
  redirect(`/account/books/invoices/${r.inv.id}?done=issued`);
}

export async function sendInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await ownInvoice(fd);
  if ('error' in r) return { error: r.error };
  if (r.inv.status === 'void') return { error: 'A void invoice can’t be sent.' };
  if (r.inv.status === 'draft') {
    const err = await issueInvoice(r.inv);
    if (err) return { error: err };
  }
  const inv = (await loadInvoice(r.ledger.id, r.inv.id))!;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const replyTo = r.ledger.invoice_reply_to || user?.email;
  if (!replyTo) return { error: 'Add a reply-to email in Settings first.' };
  const sent = await sendInvoiceEmail(inv, r.ledger, replyTo);
  if (!sent.ok) return { error: sent.error };
  revalidate();
  return { ok: true, message: `Sent to ${sent.to}.` };
}

export async function recordPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await ownInvoice(fd);
  if ('error' in r) return { error: r.error };
  if (r.inv.status !== 'issued') return { error: 'Payments go on an issued invoice.' };
  const amount = parsePounds(str(fd, 'amount'));
  const paidOn = str(fd, 'paid_on');
  const method = str(fd, 'method') as PaymentMethod;
  if (amount == null || amount <= 0) return { error: 'Enter the amount paid.' };
  if (!isIsoDate(paidOn) || paidOn > todayUk()) return { error: 'Enter the date it was paid.' };
  if (!(method in PAYMENT_METHODS)) return { error: 'Choose how it was paid.' };
  const res = await recordPayment(r.ledger, r.inv, { paid_on: paidOn, amount_pence: amount, method, reference: optional(str(fd, 'reference')), external_id: null });
  if (!res.ok) return { error: res.error };
  revalidate();
  redirect(`/account/books/invoices/${r.inv.id}?done=paid`);
}

export async function voidInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await ownInvoice(fd);
  if ('error' in r) return { error: r.error };
  const wasDraft = r.inv.status === 'draft';
  const err = await voidInvoice(r.inv);
  if (err) return { error: err };
  revalidate();
  if (wasDraft) redirect('/account/books/invoices');
  redirect(`/account/books/invoices/${r.inv.id}?done=voided`);
}
