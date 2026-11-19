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
import { blockingReasons, docFromFields, fieldsFromRead, type ReceiptFields } from './receiptRules';
import { buildPosting, validateDoc } from './posting';
import { convertPence, gbpRate } from './fx';
import { penceToDecimal } from './money';

export const RECEIPTS_BUCKET = 'books-receipts';
/** AI reads per set of books per calendar month; past it, receipts wait for hand entry. */
export const MONTHLY_AI_READS = 200;
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;

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

async function update(id: number, patch: Database['public']['Tables']['books_receipts']['Update']) {
  const { error } = await createServiceRoleClient().from('books_receipts').update(patch).eq('id', id);
  if (error) console.error('[books] receipt update failed', { id, error: error.message });
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
    .limit(1);
  return Boolean(data?.length);
}

/**
 * Post a receipt's reviewed fields to the ledger. Returns the reasons it
 * can't, or null when posted.
 */
export async function postReceiptFields(ledger: Ledger, receiptId: number, f: ReceiptFields): Promise<string[] | null> {
  const accounts = accountMap(await getAccounts(ledger.id));
  const doc = docFromFields(f);
  const errs = validateDoc(doc, ledgerForPosting(ledger), accounts);
  if (errs.length) return errs;
  const p = buildPosting(doc, ledgerForPosting(ledger), accounts, 'receipt');
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
  await update(receiptId, { ...f, status: 'posted', entry_id: entryId, review_reasons: null });
  return null;
}

/** Read one receipt with AI and post it or hold it for review. Never throws. */
export async function processReceipt(receiptId: number): Promise<void> {
  const admin = createServiceRoleClient();
  try {
    const { data: r } = await admin.from('books_receipts').select('*').eq('id', receiptId).maybeSingle();
    if (!r || r.status !== 'processing') return;
    const { data: ledger } = await admin.from('books_ledgers').select('*').eq('id', r.ledger_id).maybeSingle();
    if (!ledger) return;

    const { data: used } = await admin.rpc('books_ai_reads_this_month', { p_ledger_id: ledger.id });
    if ((used ?? 0) >= MONTHLY_AI_READS) {
      await update(receiptId, {
        status: 'needs_review',
        review_reasons: `You’ve used this month’s ${MONTHLY_AI_READS} AI reads. Enter the details by hand.`,
      });
      return;
    }

    const input = await loadFile(r);
    if (!input) {
      await update(receiptId, { status: 'needs_review', review_reasons: 'The file couldn’t be opened. Enter the details by hand.' });
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
    const usage = {
      ai_reads: r.ai_reads + 1,
      ai_input_tokens: r.ai_input_tokens + res.inputTokens,
      ai_output_tokens: r.ai_output_tokens + res.outputTokens,
      ai_cost_usd: Number(r.ai_cost_usd) + res.costUsd,
    };
    if (!res.read) {
      await update(receiptId, {
        ...usage,
        status: 'needs_review',
        extraction_error: res.error,
        review_reasons: `${res.error ?? 'The AI couldn’t read this.'} Enter the details by hand.`,
      });
      return;
    }
    const read = res.read;
    const accounts = accountMap(accountRows);
    const lp = ledgerForPosting(ledger);
    let f = fieldsFromRead(read, lp, accounts, ledger.default_payment_account);
    const notes: string[] = [];
    if (read.notes) notes.push(read.notes);
    const reasons: string[] = [];

    if (read.mileage_miles && read.mileage_miles > 0) {
      await update(receiptId, {
        ...usage,
        ...f,
        extracted: read as unknown as Json,
        confidence: read.confidence,
        status: 'needs_review',
        review_reasons: `This looks like a note of ${read.mileage_miles} business miles. Claim it on the Mileage page, then reject this receipt.`,
      });
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
    await update(receiptId, {
      ...usage,
      ...f,
      extracted: read as unknown as Json,
      confidence: read.confidence,
      notes: notes.join('\n') || null,
      extraction_error: null,
    });
    if (reasons.length) {
      await update(receiptId, { status: 'needs_review', review_reasons: reasons.join('\n') });
      return;
    }
    const failed = await postReceiptFields(ledger as Ledger, receiptId, f);
    if (failed) await update(receiptId, { status: 'needs_review', review_reasons: failed.join('\n') });
  } catch (err) {
    console.error('[books] processReceipt crashed', { receiptId, error: err instanceof Error ? err.message : err });
    await update(receiptId, { status: 'needs_review', review_reasons: 'Something went wrong reading this. Enter the details by hand.' });
  }
}

