'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { BUSINESS_TYPES, chartFor, ownerAccountsFor, isBankAccount, personalAccountCode, type BusinessType } from '@/lib/books/chart';
import { parsePounds } from '@/lib/books/money';
import { buildPosting, validateDoc, type Posting } from '@/lib/books/posting';
import { buildMileagePosting, milesFromOdometer, parseOdometer, taxYearOf } from '@/lib/books/mileage';
import { cleanVatNumber, isVatCode } from '@/lib/books/vat';
import { parseSenders } from '@/lib/books/inbound';
import { isIsoDate, todayUk } from '@/lib/books/period';
import { accountMap, businessTypeOf, getAccounts, ledgerForPosting, requireBooksWriter, voidEntry } from '@/lib/books/server';
import type { Json } from '@/lib/database.types';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const optional = (s: string) => (s === '' ? null : s);

function revalidateBooks() {
  revalidatePath('/account/books', 'layout');
}

async function post(ledgerId: string, p: Posting): Promise<string | null> {
  const { error } = await createServiceRoleClient().rpc('books_post_entry', {
    p_ledger_id: ledgerId,
    p_entry: p.entry as unknown as Json,
    p_lines: p.lines as unknown as Json,
  });
  if (error) {
    console.error('books_post_entry failed', { ledgerId, error: error.message });
    return 'That didn’t post. Please check the details and try again.';
  }
  return null;
}

// ── Settings ────────────────────────────────────────────────────────────────

const SettingsSchema = z
  .object({
    business_type: z.enum(Object.keys(BUSINESS_TYPES) as [BusinessType, ...BusinessType[]]),
    legal_name: z.string().min(1, 'Enter the business’s name.').max(200),
    company_number: z
      .string()
      .transform((s) => s.replace(/\s+/g, '').toUpperCase())
      .refine((s) => s === '' || /^[A-Z0-9]{8}$/.test(s), 'A company number is 8 characters, e.g. 12345678 or SC123456.'),
    vat_registered: z.boolean(),
    vat_number: z
      .string()
      .transform(cleanVatNumber)
      .refine((s) => s === '' || /^(GB)?\d{9}(\d{3})?$/.test(s), 'A UK VAT number is 9 digits, e.g. GB123456789.'),
    vat_scheme: z.enum(['standard', 'cash', 'flat_rate']),
    vat_quarter_stagger: z.coerce.number().int().min(0).max(2),
    flat_rate_percent: z.string(),
    vat_registration_date: z.string(),
    year_end: z.string().refine((s) => s === '' || /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s), 'Choose the year end.'),
    farming: z.boolean(),
    default_payment_account: z.string().regex(/^\d{4}$/),
    trading_name: z.string().max(200),
    address: z.string().max(500),
    phone: z.string().max(40),
    invoice_reply_to: z.string().refine((s) => s === '' || z.string().email().safeParse(s).success, 'Enter a valid email.'),
    bank_details: z.string().max(500),
    invoice_terms_days: z.coerce.number().int().min(0).max(120),
    invoice_footer: z.string().max(1000),
    inbound_senders: z.array(z.string()),
    marketplace_auto: z.boolean(),
    marketplace_from: z.string().refine((s) => s === '' || isIsoDate(s), 'Enter the date to book Emmerdale jobs from.'),
  })
  .superRefine((v, ctx) => {
    if (v.vat_registered && !v.vat_number) ctx.addIssue({ code: 'custom', message: 'Enter the VAT number.', path: ['vat_number'] });
    if (v.vat_registration_date && !isIsoDate(v.vat_registration_date)) {
      ctx.addIssue({ code: 'custom', message: 'Enter the VAT registration date.', path: ['vat_registration_date'] });
    }
    if (v.vat_scheme === 'cash') {
      // The return uses the invoice date as the tax point; cash accounting needs the payment date.
      ctx.addIssue({ code: 'custom', message: 'Cash accounting isn’t supported in Books yet: choose standard or flat rate, or ask your accountant.', path: ['vat_scheme'] });
    }
    if (v.vat_scheme === 'flat_rate') {
      const n = Number(v.flat_rate_percent);
      if (!(n > 0 && n < 100)) ctx.addIssue({ code: 'custom', message: 'Enter your flat rate percentage.', path: ['flat_rate_percent'] });
    }
  });

function readSettings(fd: FormData) {
  const month = str(fd, 'year_end_month');
  const day = str(fd, 'year_end_day');
  return SettingsSchema.safeParse({
    business_type: str(fd, 'business_type') || 'sole_trader',
    legal_name: str(fd, 'legal_name'),
    company_number: str(fd, 'company_number'),
    vat_registered: fd.get('vat_registered') === 'on',
    vat_number: str(fd, 'vat_number'),
    vat_scheme: str(fd, 'vat_scheme') || 'standard',
    vat_quarter_stagger: str(fd, 'vat_quarter_stagger') || '0',
    flat_rate_percent: str(fd, 'flat_rate_percent'),
    vat_registration_date: str(fd, 'vat_registration_date'),
    year_end: month && day ? `${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '',
    farming: fd.get('farming') === 'on',
    default_payment_account: str(fd, 'default_payment_account') || '1200',
    trading_name: str(fd, 'trading_name'),
    address: str(fd, 'address'),
    phone: str(fd, 'phone'),
    invoice_reply_to: str(fd, 'invoice_reply_to'),
    bank_details: str(fd, 'bank_details'),
    invoice_terms_days: str(fd, 'invoice_terms_days') || '7',
    invoice_footer: str(fd, 'invoice_footer'),
    inbound_senders: parseSenders(str(fd, 'inbound_senders')),
    marketplace_auto: fd.get('marketplace_auto') === 'on',
    marketplace_from: str(fd, 'marketplace_from'),
  });
}

function settingsRow(v: z.infer<typeof SettingsSchema>) {
  return {
    business_type: v.business_type,
    legal_name: v.legal_name,
    company_number: optional(v.company_number),
    vat_registered: v.vat_registered,
    vat_number: optional(v.vat_number),
    vat_scheme: v.vat_scheme,
    vat_quarter_stagger: v.vat_quarter_stagger,
    flat_rate_percent: v.vat_scheme === 'flat_rate' ? Number(v.flat_rate_percent) : null,
    vat_registration_date: optional(v.vat_registration_date),
    year_end: optional(v.year_end),
    default_payment_account: v.default_payment_account,
    trading_name: optional(v.trading_name),
    address: optional(v.address),
    phone: optional(v.phone),
    invoice_reply_to: optional(v.invoice_reply_to),
    bank_details: optional(v.bank_details),
    invoice_terms_days: v.invoice_terms_days,
    invoice_footer: optional(v.invoice_footer),
    inbound_senders: v.inbound_senders,
    marketplace_auto: v.marketplace_auto,
    marketplace_from: optional(v.marketplace_from),
  };
}

/** First visit: create the books with the chart for the business type. */
export async function createLedgerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (gate.ledger) redirect('/account/books');
  const parsed = readSettings(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  const v = parsed.data;

  const admin = createServiceRoleClient();
  const { data: ledger, error } = await admin
    .from('books_ledgers')
    .insert({ contractor_id: gate.userId, farming: v.farming, ...settingsRow(v) })
    .select('id')
    .single();
  if (error || !ledger) {
    console.error('books ledger create failed', { contractor: gate.userId, error: error?.message });
    return { error: 'Your books couldn’t be set up. Please try again.' };
  }
  const { error: accErr } = await admin.from('books_accounts').insert(
    chartFor(v.business_type, v.farming).map((a) => ({
      ledger_id: ledger.id,
      code: a.code,
      name: a.name,
      type: a.type,
      description: a.description ?? null,
      is_fixed_asset: Boolean(a.is_fixed_asset),
      is_system: Boolean(a.is_system),
    })),
  );
  if (accErr) {
    console.error('books chart seed failed', { ledger: ledger.id, error: accErr.message });
    await admin.from('books_ledgers').delete().eq('id', ledger.id);
    return { error: 'Your books couldn’t be set up. Please try again.' };
  }
  revalidateBooks();
  redirect('/account/books');
}

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const parsed = readSettings(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  const row = settingsRow(parsed.data);
  const accounts = await getAccounts(gate.ledger.id);
  if (!accounts.some((a) => a.code === row.default_payment_account && isBankAccount(a))) {
    return { error: 'Choose a bank or card account as the default.' };
  }
  const admin = createServiceRoleClient();
  // A new business type brings its own accounts for paying the owner
  // (Director's loan and Share capital, or Capital introduced and Drawings).
  // Entries already posted stay where they are.
  if (row.business_type !== gate.ledger.business_type) {
    const { error: accErr } = await admin.from('books_accounts').upsert(
      ownerAccountsFor(row.business_type).map((a) => ({
        ledger_id: gate.ledger!.id,
        code: a.code,
        name: a.name,
        type: a.type,
        description: a.description ?? null,
      })),
      { onConflict: 'ledger_id,code' },
    );
    if (accErr) {
      console.error('books type switch accounts failed', { ledger: gate.ledger.id, error: accErr.message });
      return { error: 'That didn’t save. Please try again.' };
    }
  }
  const update: typeof row & { tax_profile?: Json } = { ...row };
  if (row.business_type !== gate.ledger.business_type) {
    // The tax page's own structure follows (an LLP stays an LLP as a partnership).
    const profile = (gate.ledger.tax_profile && typeof gate.ledger.tax_profile === 'object' ? gate.ledger.tax_profile : {}) as Record<string, unknown>;
    if (!(row.business_type === 'partnership' && profile.structure === 'llp')) {
      update.tax_profile = { ...profile, structure: row.business_type } as Json;
    }
  }
  const { error } = await admin.from('books_ledgers').update(update).eq('id', gate.ledger.id);
  if (error) return { error: 'That didn’t save. Please try again.' };
  revalidateBooks();
  return { ok: true, message: 'Saved.' };
}

// ── Entries ─────────────────────────────────────────────────────────────────

export async function postEntryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const ledger = gate.ledger;
  const kind = str(fd, 'kind') === 'sale' ? 'sale' : 'purchase';
  const vatCode = str(fd, 'vat_code');
  const doc = {
    kind,
    date: str(fd, 'date'),
    counterparty: str(fd, 'counterparty'),
    reference: str(fd, 'reference'),
    description: str(fd, 'description'),
    currency: ledger.base_currency,
    net: parsePounds(str(fd, 'net')),
    vat: parsePounds(str(fd, 'vat')) ?? 0,
    gross: parsePounds(str(fd, 'gross')),
    vatCode: isVatCode(vatCode) ? vatCode : '',
    accountCode: str(fd, 'account_code'),
    paymentCode: str(fd, 'payment_code'),
  } as const;
  // Blank net: work it out from the total and VAT.
  const filled = { ...doc, net: doc.net ?? (doc.gross != null ? doc.gross - (doc.vat ?? 0) : null) };
  const accounts = accountMap(await getAccounts(ledger.id));
  const errs = validateDoc(filled, ledgerForPosting(ledger), accounts);
  if (errs.length) return { error: errs.join(' ') };
  const err = await post(ledger.id, buildPosting(filled, ledgerForPosting(ledger), accounts, 'manual'));
  if (err) return { error: err };
  revalidateBooks();
  redirect(`/account/books?posted=${kind}`);
}

export async function postMileageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const ledger = gate.ledger;
  const date = str(fd, 'date');
  const driver = str(fd, 'driver');
  const miles = Number(str(fd, 'miles'));
  const odoStart = str(fd, 'odometer_start');
  const odoFinish = str(fd, 'odometer_finish');
  let odometer: { start: number; finish: number } | null = null;
  if (odoStart || odoFinish) {
    const start = parseOdometer(odoStart);
    const finish = parseOdometer(odoFinish);
    if (start === null || finish === null) return { error: 'Enter both odometer readings, or leave both blank.' };
    const shown = milesFromOdometer(odoStart, odoFinish);
    if (shown === null) return { error: 'The finish reading should be higher than the start.' };
    if (miles > shown) return { error: `Business miles can’t be more than the ${shown.toLocaleString('en-GB')} the readings show.` };
    odometer = { start, finish };
  }
  const payCode = str(fd, 'pay_code') || personalAccountCode(businessTypeOf(ledger));
  if (!isIsoDate(date)) return { error: 'Enter the date of the journey.' };
  if (date > todayUk()) return { error: 'A mileage claim can’t be in the future.' };
  if (!driver) return { error: 'Enter who drove.' };
  if (miles > 2000) return { error: 'One claim can be up to 2,000 miles. Split a longer run into separate journeys.' };
  if (!(miles > 0) || Math.round(miles * 10) !== miles * 10) {
    return { error: 'Enter the business miles (up to one decimal place).' };
  }
  const accounts = await getAccounts(ledger.id);
  const personal = personalAccountCode(businessTypeOf(ledger));
  if (!accounts.some((a) => a.code === payCode && (a.code === personal || isBankAccount(a)))) {
    return { error: 'Choose who pays the driver.' };
  }
  if (!accounts.some((a) => a.code === '6330')) return { error: 'Your books have no 6330 Mileage allowance account.' };
  const ty = taxYearOf(date);
  const { data: claimed, error } = await createServiceRoleClient().rpc('books_mileage_claimed', {
    p_ledger_id: ledger.id,
    p_driver: driver,
    p_from: ty.from,
    // Claims dated up to this journey: the first 10,000 miles of the tax year
    // are the earliest ones, whatever order they're entered in.
    p_to: date,
  });
  if (error) return { error: 'That didn’t post. Please try again.' };
  const err = await post(
    ledger.id,
    buildMileagePosting({ date, driver, miles, journey: str(fd, 'journey'), purpose: str(fd, 'purpose'), payCode, odometer }, Number(claimed ?? 0)),
  );
  if (err) return { error: err };
  revalidateBooks();
  redirect('/account/books?posted=mileage');
}

/** Void a hand-entered entry, mileage claim or receipt's entry: it is removed from the books. */
export async function voidEntryAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  const id = Number(fd.get('entry_id'));
  if (!Number.isSafeInteger(id)) return;
  await voidEntry(gate.ledger.id, id);
  revalidateBooks();
}

// ── Accounts ────────────────────────────────────────────────────────────────

const AccountSchema = z.object({
  code: z.string().regex(/^\d{4}$/, 'An account code is four digits.'),
  name: z.string().min(1, 'Name the account.').max(120),
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  description: z.string().max(300),
  is_fixed_asset: z.boolean(),
});

export async function addAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const parsed = AccountSchema.safeParse({
    code: str(fd, 'code'),
    name: str(fd, 'name'),
    type: str(fd, 'type'),
    description: str(fd, 'description'),
    is_fixed_asset: fd.get('is_fixed_asset') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  const v = parsed.data;
  if (v.is_fixed_asset && v.type !== 'asset') return { error: 'A fixed asset account must be an asset.' };
  const { error } = await createServiceRoleClient()
    .from('books_accounts')
    .insert({ ledger_id: gate.ledger.id, code: v.code, name: v.name, type: v.type, description: optional(v.description), is_fixed_asset: v.is_fixed_asset });
  if (error) return { error: error.code === '23505' ? `There is already an account ${v.code}.` : 'That didn’t save. Please try again.' };
  revalidateBooks();
  return { ok: true, message: `Added ${v.code} ${v.name}.` };
}
