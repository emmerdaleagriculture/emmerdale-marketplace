'use server';

import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { requireBooksWriter, voidEntry, type Ledger } from '@/lib/books/server';
import {
  MAX_RECEIPT_BYTES,
  STUCK_AFTER_MS,
  RECEIPTS_BUCKET,
  RECEIPT_TYPES,
  postReceiptFields,
  processReceipt,
  storeReceipt,
} from '@/lib/books/receipts.server';
import type { ReceiptFields } from '@/lib/books/receiptRules';
import { parsePounds } from '@/lib/books/money';
import { isVatCode } from '@/lib/books/vat';
import { isIsoDate } from '@/lib/books/period';

const UPLOADABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function revalidate() {
  revalidatePath('/account/books', 'layout');
}

/** Does the file start the way its type says? Stops a renamed HTML file posing as a PDF. */
function looksLike(mime: string, b: Buffer): boolean {
  const hex = b.subarray(0, 12).toString('hex');
  switch (mime) {
    case 'application/pdf':
      return b.subarray(0, 1024).includes(Buffer.from('%PDF'));
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/png':
      return hex.startsWith('89504e47');
    case 'image/gif':
      return hex.startsWith('47494638');
    case 'image/webp':
      return hex.startsWith('52494646') && b.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: string };

/**
 * Step 1 of an upload: a one-time signed URL to put the file straight into
 * private storage (Vercel caps request bodies at 4.5MB, too small for photos
 * and PDFs). The path is inside this ledger's own folder.
 */
export async function startReceiptUploadAction(input: { name: string; mime: string; size: number }): Promise<UploadTicket> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.ledger) return { ok: false, error: 'Set up your books first.' };
  if (!UPLOADABLE.includes(input.mime)) {
    return { ok: false, error: `${input.name}: send a PDF or a photo (JPEG, PNG, GIF or WebP).` };
  }
  if (!(input.size > 0 && input.size <= MAX_RECEIPT_BYTES)) return { ok: false, error: `${input.name} is over 20MB.` };
  const path = `${gate.ledger.id}/uploads/${randomUUID()}.${RECEIPT_TYPES[input.mime]}`;
  const { data, error } = await createServiceRoleClient().storage.from(RECEIPTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'Uploads aren’t working just now. Please try again.' };
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: check what arrived, create the receipt, and read it after the response. */
export async function finishReceiptUploadAction(input: { path: string; name: string; mime: string }): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.ledger) return { ok: false, error: 'Set up your books first.' };
  const ledgerId = gate.ledger.id;
  if (!input.path.startsWith(`${ledgerId}/uploads/`) || input.path.includes('..') || !UPLOADABLE.includes(input.mime)) {
    return { ok: false, error: 'That upload isn’t yours.' };
  }
  const admin = createServiceRoleClient();
  const { data: blob, error } = await admin.storage.from(RECEIPTS_BUCKET).download(input.path);
  if (error || !blob) return { ok: false, error: `${input.name} didn’t arrive. Please try again.` };
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf.length > MAX_RECEIPT_BYTES || !looksLike(input.mime, buf)) {
    await admin.storage.from(RECEIPTS_BUCKET).remove([input.path]);
    return { ok: false, error: `${input.name} isn’t a readable PDF or photo.` };
  }
  const stored = await storeReceipt(ledgerId, { buf, mime: input.mime, name: input.name, alreadyAt: input.path }, { source: 'upload' });
  if ('error' in stored) return { ok: false, error: stored.error };
  if (stored.read) after(() => processReceipt(stored.id));
  revalidate();
  return { ok: true, duplicate: !stored.read };
}

async function ownReceipt(ledger: Ledger, id: number) {
  const { data } = await createServiceRoleClient()
    .from('books_receipts')
    .select('*')
    .eq('id', id)
    .eq('ledger_id', ledger.id)
    .maybeSingle();
  return data;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function midRead(r: { status: string; processing_started_at: string | null }): boolean {
  return r.status === 'processing' && Boolean(r.processing_started_at) && Date.now() - Date.parse(r.processing_started_at!) < STUCK_AFTER_MS;
}

function fieldsFromForm(fd: FormData): ReceiptFields {
  const gross = parsePounds(str(fd, 'gross'));
  const vat = parsePounds(str(fd, 'vat')) ?? 0;
  const netTyped = parsePounds(str(fd, 'net'));
  const vatCode = str(fd, 'vat_code');
  const kind = str(fd, 'doc_type');
  return {
    doc_type: kind === 'sale' ? 'sale' : kind === 'purchase' ? 'purchase' : null,
    doc_date: isIsoDate(str(fd, 'doc_date')) ? str(fd, 'doc_date') : null,
    counterparty: str(fd, 'counterparty') || null,
    counterparty_vat_number: str(fd, 'counterparty_vat_number').replace(/\s+/g, '').toUpperCase() || null,
    reference: str(fd, 'reference') || null,
    description: str(fd, 'description') || null,
    currency: 'GBP',
    net_pence: netTyped ?? (gross != null ? gross - vat : null),
    vat_pence: vat,
    gross_pence: gross,
    vat_code: isVatCode(vatCode) ? vatCode : null,
    account_code: str(fd, 'account_code') || null,
    payment_account_code: str(fd, 'payment_account_code') || null,
  };
}

async function nextForReview(ledgerId: string, exclude: number): Promise<number | null> {
  const { data } = await createServiceRoleClient()
    .from('books_receipts')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('status', 'needs_review')
    .neq('id', exclude)
    .order('received_at', { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

/** Save or post the review form; intent = save | post. */
export async function reviewReceiptAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const id = Number(fd.get('receipt_id'));
  const r = Number.isSafeInteger(id) ? await ownReceipt(gate.ledger, id) : null;
  if (!r) return { error: 'That receipt isn’t in your books.' };
  if (r.status === 'posted') return { error: 'This receipt is posted. Void its entry first to change it.' };
  if (r.status === 'processing') return { error: 'This receipt is still being read.' };
  const f = fieldsFromForm(fd);
  if (str(fd, 'intent') === 'post') {
    const errs = await postReceiptFields(gate.ledger, id, f);
    if (errs) {
      await createServiceRoleClient().from('books_receipts').update(f).eq('id', id);
      return { error: errs.join(' ') };
    }
    revalidate();
    const next = await nextForReview(gate.ledger.id, id);
    redirect(next ? `/account/books/receipts/${next}?posted=${id}` : `/account/books/receipts?posted=${id}`);
  }
  const { error } = await createServiceRoleClient()
    .from('books_receipts')
    .update({ ...f, status: r.status === 'rejected' || r.status === 'duplicate' ? 'needs_review' : r.status })
    .eq('id', id);
  if (error) return { error: 'That didn’t save. Please try again.' };
  revalidate();
  return { ok: true, message: 'Saved.' };
}

export async function rereadReceiptAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  const id = Number(fd.get('receipt_id'));
  const r = Number.isSafeInteger(id) ? await ownReceipt(gate.ledger, id) : null;
  if (!r || r.status === 'posted' || midRead(r)) return;
  // A new start time: a dead read that wakes up can no longer write.
  await createServiceRoleClient()
    .from('books_receipts')
    .update({ status: 'processing', processing_started_at: new Date().toISOString(), review_reasons: null })
    .eq('id', id);
  after(() => processReceipt(id));
  revalidate();
}

export async function rejectReceiptAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  const id = Number(fd.get('receipt_id'));
  const r = Number.isSafeInteger(id) ? await ownReceipt(gate.ledger, id) : null;
  if (!r || r.status === 'posted' || midRead(r)) return;
  await createServiceRoleClient().from('books_receipts').update({ status: 'rejected' }).eq('id', id);
  revalidate();
  const next = await nextForReview(gate.ledger.id, id);
  redirect(next ? `/account/books/receipts/${next}` : '/account/books/receipts');
}

/** Remove a posted receipt's entry and send it back to review. */
export async function voidReceiptEntryAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  const id = Number(fd.get('receipt_id'));
  const r = Number.isSafeInteger(id) ? await ownReceipt(gate.ledger, id) : null;
  if (!r || r.status !== 'posted' || !r.entry_id) return;
  await voidEntry(gate.ledger.id, r.entry_id);
  revalidate();
}
