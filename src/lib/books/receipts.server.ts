/**
 * Receipt processing for Books: store, read with AI, apply the posting
 * rules, post or hold for review. Runs after the upload response (next/server
 * after()), so it must never throw: every failure ends in needs_review with a
 * reason a person can act on.
 */

import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/database.types';
import { accountMap, getAccounts, ledgerForPosting, type Ledger } from './server';
import { readReceipt, type ReadInput } from './receiptAi';
import { blockingReasons, cleanConfidence, docFromFields, fieldsFromRead, type ReceiptFields } from './receiptRules';
import { buildPosting, validateDoc, type AccountInfo } from './posting';
import { convertPence, gbpRate } from './fx';
import { penceToDecimal } from './money';
import { addDays } from './period';
import { MATCH_DAYS } from './bank';

export const RECEIPTS_BUCKET = 'books-receipts';
/** AI reads per set of books per calendar month; past it, receipts wait for hand entry. */
export const MONTHLY_AI_READS = 200;
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;
/** A read that started over 5 minutes ago has died (the function's own limit is 300s). */
export const STUCK_AFTER_MS = 5 * 60_000;

export const RECEIPT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/html': 'html',
};

export type Receipt = Database['public']['Tables']['books_receipts']['Row'];

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function receiptPath(ledgerId: string, sha: string, mime: string): string {
  return `${ledgerId}/${sha.slice(0, 2)}/${sha}.${RECEIPT_TYPES[mime] ?? 'bin'}`;
}

/**
 * Store one file and create its receipt. The same file already in these books
 * (not rejected or failed) is recorded as a duplicate and not read again.
 * Returns the new receipt's id and whether it should be read.
 */
export async function storeReceipt(
  ledgerId: string,
  file: { buf: Buffer; mime: string; name: string | null; alreadyAt?: string },
  extra: Partial<Database['public']['Tables']['books_receipts']['Insert']> = {},
): Promise<{ id: number; read: boolean } | { error: string }> {
  const admin = createServiceRoleClient();
  const sha = sha256(file.buf);
  const { data: existing } = await admin
    .from('books_receipts')
    .select('id, file_path')
    .eq('ledger_id', ledgerId)
    .eq('sha256', sha)
    .not('status', 'in', '(rejected,failed,duplicate)')
    .limit(1);
  const dup = existing?.[0] ?? null;
  let path: string;
  if (dup) {
    // Keep one copy: point at the original's file and drop the new upload.
    path = dup.file_path ?? receiptPath(ledgerId, sha, file.mime);
    if (file.alreadyAt && file.alreadyAt !== path) await admin.storage.from(RECEIPTS_BUCKET).remove([file.alreadyAt]);
  } else if (file.alreadyAt) {
    path = file.alreadyAt;
  } else {
    path = receiptPath(ledgerId, sha, file.mime);
    const { error: upErr } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, file.buf, { contentType: file.mime, upsert: true });
    if (upErr) {
      console.error('[books] receipt upload failed', { ledgerId, error: upErr.message });
      return { error: 'The file couldn’t be stored. Please try again.' };
    }
  }
  const { data, error } = await admin
    .from('books_receipts')
    .insert({
      ledger_id: ledgerId,
      status: dup ? 'duplicate' : 'processing',
      file_path: path,
      file_name: file.name?.slice(0, 200) ?? null,
      mime_type: file.mime,
      sha256: sha,
      size_bytes: file.buf.length,
      review_reasons: dup ? `Already in your books as receipt #${dup.id}.` : null,
      processing_started_at: dup ? null : new Date().toISOString(),
      ...extra,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[books] receipt insert failed', { ledgerId, error: error?.message });
    return { error: 'The file couldn’t be saved. Please try again.' };
  }
  return { id: data.id, read: !dup };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function loadFile(r: Receipt): Promise<ReadInput | null> {
  if (!r.file_path || !r.mime_type) return null;
  const { data, error } = await createServiceRoleClient().storage.from(RECEIPTS_BUCKET).download(r.file_path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  if (r.mime_type === 'application/pdf') return { kind: 'pdf', base64: buf.toString('base64') };
  if (r.mime_type === 'text/html') return { kind: 'text', text: htmlToText(buf.toString('utf8')) };
  if (r.mime_type === 'text/plain') return { kind: 'text', text: buf.toString('utf8') };
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(r.mime_type)) {
    return { kind: 'image', base64: buf.toString('base64'), mediaType: r.mime_type as 'image/jpeg' };
  }
  return null;
}

type ReceiptPatch = Database['public']['Tables']['books_receipts']['Update'];

async function update(id: number, patch: ReceiptPatch): Promise<boolean> {
  const { error } = await createServiceRoleClient().from('books_receipts').update(patch).eq('id', id);
  if (error) console.error('[books] receipt update failed', { id, error: error.message });
  return !error;
}

/**
 * Write only if this read still owns the receipt: still processing, from the
 * same start. A reject or a fresh "read again" since then wins, and this
 * read's results are dropped. Returns whether the write landed.
 */
async function updateIfOurs(id: number, startedAt: string, patch: ReceiptPatch): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .from('books_receipts')
    .update(patch)
    .eq('id', id)
    .eq('status', 'processing')
    .eq('processing_started_at', startedAt)
    .select('id');
  if (error) console.error('[books] receipt update failed', { id, error: error.message });
  return Boolean(data?.length);
}

async function sameEntryExists(ledgerId: string, f: ReceiptFields): Promise<boolean> {
  if (!f.doc_date || f.gross_pence == null || !f.doc_type) return false;
  const { data } = await createServiceRoleClient()
    .from('books_entries')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('entry_date', f.doc_date)
    .eq('gross_pence', f.gross_pence)
    .eq('kind', f.doc_type)
    // A statement row booked automatically isn't a duplicate: the receipt replaces it.
    .or('external_id.is.null,external_id.not.like.bank:*')
    .limit(1);
  return Boolean(data?.length);
}

/**
 * A statement row booked before its receipt arrived: same bank account, same
 * total, within a few days. The receipt knows more (VAT, what was bought),
 * so its entry replaces the row's; the statement then shows the row as
 * already in the books.
 */
async function supersedeBankRow(ledgerId: string, f: ReceiptFields, receiptEntryId: number): Promise<void> {
  const code = f.payment_account_code;
  if (!code || !/^12\d\d$/.test(code) || !f.doc_date || f.gross_pence == null || !f.doc_type) return;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('books_entries')
    .select('id, entry_date, books_lines(debit_pence, credit_pence, books_accounts(code))')
    .eq('ledger_id', ledgerId)
    .eq('source', 'bank')
    .eq('kind', f.doc_type)
    .eq('gross_pence', f.gross_pence)
    .like('external_id', 'bank:%')
    .is('receipt_id', null)
    .gte('entry_date', addDays(f.doc_date, -MATCH_DAYS))
    .lte('entry_date', addDays(f.doc_date, MATCH_DAYS))
    .neq('id', receiptEntryId)
    .limit(20);
  const gross = f.gross_pence;
  const onBank = (e: NonNullable<typeof data>[number]) =>
    (e.books_lines as unknown as { debit_pence: number; credit_pence: number; books_accounts: { code: string } | null }[]).some(
      (l) => l.books_accounts?.code === code && (f.doc_type === 'purchase' ? l.credit_pence : l.debit_pence) === gross,
    );
  const days = (d: string) => Math.abs(Date.parse(d) - Date.parse(f.doc_date!));
  const best = (data ?? []).filter(onBank).sort((a, b) => days(a.entry_date) - days(b.entry_date))[0];
  if (!best) return;
  const { error } = await admin.from('books_entries').delete().eq('id', best.id).eq('ledger_id', ledgerId);
  if (error) console.error('[books] bank row supersede failed', { ledgerId, entry: best.id, error: error.message });
}

/**
 * Post a receipt's reviewed fields to the ledger. Returns the reasons it
 * can't, or null when posted.
 */
export async function postReceiptFields(
  ledger: Ledger,
  receiptId: number,
  f: ReceiptFields,
  accounts?: Map<string, AccountInfo>,
  /** From an automatic read: only mark posted if the read still owns the receipt. */
  token?: string,
): Promise<string[] | null> {
  const acc = accounts ?? accountMap(await getAccounts(ledger.id));
  const doc = docFromFields(f);
  const errs = validateDoc(doc, ledgerForPosting(ledger), acc);
  if (errs.length) return errs;
  const p = buildPosting(doc, ledgerForPosting(ledger), acc, 'receipt');
  const admin = createServiceRoleClient();
  const { data: entryId, error } = await admin.rpc('books_post_entry', {
    p_ledger_id: ledger.id,
    p_entry: { ...p.entry, receipt_id: receiptId, external_id: `receipt:${receiptId}` } as unknown as Json,
    p_lines: p.lines as unknown as Json,
  });
  if (error || entryId == null) {
    console.error('[books] receipt post failed', { receiptId, error: error?.message });
    return ['That didn’t post. Please check the details and try again.'];
  }
  const patch = { ...f, status: 'posted', entry_id: entryId, review_reasons: null };
  if (token) {
    // Rejected or re-queued while this posted: undo the entry, leave their choice.
    if (!(await updateIfOurs(receiptId, token, patch))) {
      await admin.from('books_entries').delete().eq('id', entryId).eq('ledger_id', ledger.id);
      return null;
    }
    await supersedeBankRow(ledger.id, f, entryId);
    return null;
  }
  await update(receiptId, patch);
  await supersedeBankRow(ledger.id, f, entryId);
  return null;
}

/** Read one receipt with AI and post it or hold it for review. Never throws. */
export async function processReceipt(receiptId: number): Promise<void> {
  const admin = createServiceRoleClient();
  let token: string | null = null;
  const toReview = (reasons: string, patch: ReceiptPatch = {}) =>
    token ? updateIfOurs(receiptId, token, { ...patch, status: 'needs_review', review_reasons: reasons }) : Promise.resolve(false);
  try {
    const { data: r } = await admin.from('books_receipts').select('*').eq('id', receiptId).maybeSingle();
    if (!r || r.status !== 'processing' || !r.processing_started_at) return;
    token = r.processing_started_at;
    const { data: ledgerRow } = await admin.from('books_ledgers').select('*').eq('id', r.ledger_id).maybeSingle();
    if (!ledgerRow) return;
    const ledger = ledgerRow as Ledger;

    // Count the read before making it; the cap holds under a burst of uploads.
    const { data: slot, error: slotErr } = await admin.rpc('books_reserve_ai_read', {
      p_receipt_id: receiptId,
      p_started_at: token,
      p_cap: MONTHLY_AI_READS,
    });
    if (slotErr || slot === 'stale') return;
    if (slot !== 'ok') {
      await toReview(`You’ve used this month’s ${MONTHLY_AI_READS} AI reads. Enter the details by hand.`);
      return;
    }

    const input = await loadFile(r);
    if (!input) {
      await toReview('The file couldn’t be opened. Enter the details by hand.');
      return;
    }
    const accountRows = await getAccounts(ledger.id);
    const res = await readReceipt(input, {
      businessName: ledger.trading_name || ledger.legal_name,
      businessType: ledger.business_type,
      vatRegistered: ledger.vat_registered,
      accounts: accountRows,
      fileName: r.file_name,
      receivedAt: r.received_at,
      emailSubject: r.email_subject,
      emailFrom: r.email_from,
    });
    // Tokens and cost are recorded whatever happens next (the read itself was counted above).
    await update(receiptId, {
      ai_input_tokens: r.ai_input_tokens + res.inputTokens,
      ai_output_tokens: r.ai_output_tokens + res.outputTokens,
      ai_cost_usd: Number(r.ai_cost_usd) + res.costUsd,
    });
    if (!res.read) {
      await toReview(`${res.error ?? 'The AI couldn’t read this.'} Enter the details by hand.`, { extraction_error: res.error });
      return;
    }
    const read = res.read;
    const confidence = cleanConfidence(read.confidence);
    const accounts = accountMap(accountRows);
    const lp = ledgerForPosting(ledger);
    let f = fieldsFromRead(read, lp, accounts, ledger.default_payment_account);
    const notes: string[] = [];
    if (read.notes) notes.push(read.notes);
    if (read.is_paid === false && f.doc_type) {
      notes.push(f.doc_type === 'sale' ? 'Not paid yet: recorded as owed to you (1100 Trade debtors).' : 'Not paid yet: recorded as owed by you (2100 Trade creditors).');
    }
    const reasons: string[] = [];
    const base = { extracted: read as unknown as Json, confidence, extraction_error: null };

    if (read.mileage_miles && read.mileage_miles > 0) {
      await toReview(
        `This looks like a note of ${read.mileage_miles} business miles. Claim it on the Mileage page, then reject this receipt.`,
        { ...base, ...f },
      );
      return;
    }

    if (f.currency && f.currency !== ledger.base_currency) {
      const fx = await gbpRate(f.currency, f.doc_date ?? r.received_at.slice(0, 10));
      if (!fx) {
        reasons.push(`It’s in ${f.currency} and the exchange rate couldn’t be fetched. Enter the amounts in pounds.`);
      } else {
        const original = `${f.currency} ${penceToDecimal(f.gross_pence ?? 0)} at ${fx.rate} (ECB ${fx.rateDate})`;
        f = {
          ...f,
          net_pence: convertPence(f.net_pence, fx.rate),
          vat_pence: convertPence(f.vat_pence, fx.rate),
          gross_pence: convertPence(f.gross_pence, fx.rate),
          currency: ledger.base_currency,
          description: [f.description, `(${original})`].filter(Boolean).join(' '),
        };
        // Rounding each part separately can leave net + VAT a penny off the total.
        if (f.net_pence != null && f.vat_pence != null && f.gross_pence != null) f.net_pence = f.gross_pence - f.vat_pence;
        notes.push(`Converted from ${original}.`);
      }
    }

    reasons.push(...blockingReasons(f, read, lp, accounts, { sameEntryExists: await sameEntryExists(ledger.id, f) }));
    // Save what was read. If this doesn't land (rejected meanwhile, or a write
    // error), stop: nothing posts without its read on record.
    const saved = await updateIfOurs(receiptId, token, { ...base, ...f, notes: notes.join('\n') || null });
    if (!saved) return;
    if (reasons.length) {
      await toReview(reasons.join('\n'));
      return;
    }
    const failed = await postReceiptFields(ledger, receiptId, f, accounts, token);
    if (failed) await toReview(failed.join('\n'));
  } catch (err) {
    console.error('[books] processReceipt crashed', { receiptId, error: err instanceof Error ? err.message : err });
    await toReview('Something went wrong reading this. Enter the details by hand.');
  }
}
