import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
import { isBankAccount, personalAccountCode } from './chart';
import { buildMileagePosting, taxYearOf } from './mileage';
import { isIsoDate, todayUk } from './period';
import { buildPosting, validateDoc, type PostableDoc, type Posting } from './posting';
import { accountMap, businessTypeOf, getAccounts, ledgerForPosting, type Ledger } from './server';

/**
 * Recording in the books, shared by the forms (server actions) and Ask: the
 * same checks and the same posting whichever way the request arrives. Callers
 * decide who may write (requireBooksWriter); these work on the ledger given.
 */

export type Posted = { ok: true; entryId: number } | { ok: false; error: string };
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export async function postEntry(ledgerId: string, p: Posting): Promise<Posted> {
  const { data, error } = await createServiceRoleClient().rpc('books_post_entry', {
    p_ledger_id: ledgerId,
    p_entry: p.entry as unknown as Json,
    p_lines: p.lines as unknown as Json,
  });
  if (error || data == null) {
    console.error('books_post_entry failed', { ledgerId, error: error?.message });
    return { ok: false, error: 'That didn’t post. Please check the details and try again.' };
  }
  return { ok: true, entryId: data };
}

/** A purchase or sale, checked against the ledger's accounts and VAT settings; the posting it would make. */
export async function checkDocument(ledger: Ledger, doc: PostableDoc, source = 'manual'): Promise<Checked<Posting>> {
  // Blank net: work it out from the total and VAT.
  const filled = { ...doc, net: doc.net ?? (doc.gross != null ? doc.gross - (doc.vat ?? 0) : null) };
  const accounts = accountMap(await getAccounts(ledger.id));
  const errs = validateDoc(filled, ledgerForPosting(ledger), accounts);
  if (errs.length) return { ok: false, error: errs.join(' ') };
  return { ok: true, value: buildPosting(filled, ledgerForPosting(ledger), accounts, source) };
}

export async function recordDocument(ledger: Ledger, doc: PostableDoc, source = 'manual'): Promise<Posted> {
  const checked = await checkDocument(ledger, doc, source);
  return checked.ok ? postEntry(ledger.id, checked.value) : checked;
}

export type MileageInput = {
  date: string;
  driver: string;
  miles: number;
  journey: string;
  purpose: string;
  /** Who pays the driver: blank for the owner's own account. */
  payCode: string;
  odometer: { start: number; finish: number } | null;
};

/** A mileage claim, checked; the posting it would make at the rates for the miles already claimed this tax year. */
export async function checkMileage(ledger: Ledger, input: MileageInput): Promise<Checked<Posting>> {
  const driver = input.driver.trim();
  const { date, miles } = input;
  const personal = personalAccountCode(businessTypeOf(ledger));
  const payCode = input.payCode || personal;
  if (!isIsoDate(date)) return { ok: false, error: 'Enter the date of the journey.' };
  if (date > todayUk()) return { ok: false, error: 'A mileage claim can’t be in the future.' };
  if (!driver) return { ok: false, error: 'Enter who drove.' };
  if (miles > 2000) return { ok: false, error: 'One claim can be up to 2,000 miles. Split a longer run into separate journeys.' };
  if (!(miles > 0) || Math.round(miles * 10) !== miles * 10) {
    return { ok: false, error: 'Enter the business miles (up to one decimal place).' };
  }
  const accounts = await getAccounts(ledger.id);
  if (!accounts.some((a) => a.code === payCode && (a.code === personal || isBankAccount(a)))) {
    return { ok: false, error: 'Choose who pays the driver.' };
  }
  if (!accounts.some((a) => a.code === '6330')) return { ok: false, error: 'Your books have no 6330 Mileage allowance account.' };
  const ty = taxYearOf(date);
  const { data: claimed, error } = await createServiceRoleClient().rpc('books_mileage_claimed', {
    p_ledger_id: ledger.id,
    p_driver: driver,
    p_from: ty.from,
    // Claims dated up to this journey: the first 10,000 miles of the tax year
    // are the earliest ones, whatever order they're entered in.
    p_to: date,
  });
  if (error) return { ok: false, error: 'That didn’t post. Please try again.' };
  return {
    ok: true,
    value: buildMileagePosting({ date, driver, miles, journey: input.journey, purpose: input.purpose, payCode, odometer: input.odometer }, Number(claimed ?? 0)),
  };
}

export async function recordMileage(ledger: Ledger, input: MileageInput): Promise<Posted> {
  const checked = await checkMileage(ledger, input);
  return checked.ok ? postEntry(ledger.id, checked.value) : checked;
}
