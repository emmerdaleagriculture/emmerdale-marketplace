import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { RECEIPTS_BUCKET, STUCK_AFTER_MS, htmlToText } from '@/lib/books/receipts.server';
import { isPaymentAccount, isPurchaseCategory, isSaleCategory, type BusinessType } from '@/lib/books/chart';
import { PICKABLE_VAT_CODES } from '@/lib/books/vat';
import { formatPence, penceToDecimal } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import f from '@/components/forms/forms.module.css';
import m from '../../../market/market.module.css';
import s from '../../books.module.css';
import { BooksFrame } from '../../BooksFrame';
import { AutoRefresh } from '../AutoRefresh';
import { ReceiptForm } from './ReceiptForm';
import { rejectReceiptAction, rereadReceiptAction, voidReceiptEntryAction } from '../actions';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false, follow: false } };
export const maxDuration = 300;

const STATUS: Record<string, string> = {
  processing: 'Being read',
  needs_review: 'Waiting for you',
  posted: 'Posted',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
  failed: 'Failed',
};

/** One receipt: the original beside the form, with the AI's reasons and notes. */
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string }> }) {
  const { id: raw } = await params;
  const { posted } = await searchParams;
  const id = Number(raw);
  const access = await loadLedger(`/account/books/receipts/${raw}`);
  if (!Number.isSafeInteger(id)) notFound();
  const admin = createServiceRoleClient();
  const { data: r } = await admin.from('books_receipts').select('*').eq('id', id).eq('ledger_id', access.ledger.id).maybeSingle();
  if (!r) notFound();
  const accounts = await getAccounts(access.ledger.id);

  // The original. PDFs and images open from a short-lived signed link; an
  // email body is shown as plain text so nothing in it can run.
  let url: string | null = null;
  let text: string | null = null;
  if (r.file_path) {
    if (r.mime_type === 'text/html' || r.mime_type === 'text/plain') {
      const { data } = await admin.storage.from(RECEIPTS_BUCKET).download(r.file_path);
      if (data) {
        const raw = await data.text();
        text = (r.mime_type === 'text/html' ? htmlToText(raw) : raw).slice(0, 50_000);
      }
    } else {
      const { data } = await admin.storage.from(RECEIPTS_BUCKET).createSignedUrl(r.file_path, 600);
      url = data?.signedUrl ?? null;
    }
  }
  const stuck = r.status === 'processing' && r.processing_started_at && Date.now() - Date.parse(r.processing_started_at) > STUCK_AFTER_MS;
  const editable = access.canEdit && (r.status === 'needs_review' || r.status === 'rejected' || r.status === 'duplicate');

  return (
    <BooksFrame access={access} title={r.counterparty ?? r.file_name ?? `Receipt #${r.id}`} tab="receipts" crumb={`Receipt #${r.id}`}>
      <AutoRefresh active={r.status === 'processing' && !stuck} />
      {posted && <p className={s.notice}>Receipt #{posted} posted. Here’s the next one waiting.</p>}
      <p className={m.sub}>
        <b>{STATUS[r.status] ?? r.status}</b> · received {ukDate(r.received_at.slice(0, 10))}
        {r.file_name ? ` · ${r.file_name}` : ''}
        {r.ai_reads > 0 ? ` · AI cost ${(Number(r.ai_cost_usd) * 100).toFixed(1)}¢` : ''}
      </p>

      {r.review_reasons && r.status !== 'posted' && (
        <div className={s.readOnly}>
          {r.review_reasons.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {r.notes && <p className={s.notice}>{r.notes}</p>}

      <div className={s.receiptGrid}>
        <div className={s.receiptFile}>
          {url && r.mime_type === 'application/pdf' && (
            <>
              <iframe src={url} title="The receipt" className={s.receiptFrame} />
              <a className={s.link} href={url} target="_blank" rel="noreferrer">
                Open the PDF
              </a>
            </>
          )}
          {url && r.mime_type?.startsWith('image/') && (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="The receipt" className={s.receiptImage} /></a>
          )}
          {text != null && <pre className={s.receiptText}>{text}</pre>}
          {!url && text == null && <p className={s.muted}>No file.</p>}
        </div>

        <div>
          {r.status === 'processing' ? (
            <p className={m.sub}>
              {stuck ? 'This has been reading for a while.' : 'Reading this now. The page will update by itself.'}
            </p>
          ) : r.status === 'posted' ? (
            <div className={s.entry}>
              <p>
                Posted on {r.doc_date ? ukDate(r.doc_date) : ''}: {r.doc_type === 'sale' ? 'sale' : 'expense'} of{' '}
                <b>{formatPence(r.gross_pence ?? 0)}</b>
                {r.vat_pence ? ` (VAT ${formatPence(r.vat_pence)})` : ''} to {r.account_code}{' '}
                {accounts.find((a) => a.code === r.account_code)?.name}.
              </p>
              {r.description && <p className={s.muted}>{r.description}</p>}
              {access.canEdit && (
                <form action={voidReceiptEntryAction}>
                  <input type="hidden" name="receipt_id" value={r.id} />
                  <button className={f.btnGhost} type="submit">
                    Void entry and edit
                  </button>
                </form>
              )}
            </div>
          ) : editable ? (
            <ReceiptForm
              receiptId={r.id}
              values={{
                doc_type: r.doc_type ?? 'purchase',
                doc_date: r.doc_date ?? '',
                counterparty: r.counterparty ?? '',
                counterparty_vat_number: r.counterparty_vat_number ?? '',
                reference: r.reference ?? '',
                description: r.description ?? '',
                gross: r.gross_pence != null ? penceToDecimal(r.gross_pence) : '',
                vat: r.vat_pence != null ? penceToDecimal(r.vat_pence) : '',
                net: r.net_pence != null ? penceToDecimal(r.net_pence) : '',
                vat_code: r.vat_code ?? 'STD',
                account_code: r.account_code ?? '',
                payment_account_code: r.payment_account_code ?? access.ledger.default_payment_account,
              }}
              purchaseAccounts={accounts.filter(isPurchaseCategory).map(({ code, name }) => ({ code, name }))}
              saleAccounts={accounts.filter(isSaleCategory).map(({ code, name }) => ({ code, name }))}
              paymentAccounts={accounts.filter((a) => isPaymentAccount(a, access.ledger.business_type as BusinessType)).map(({ code, name }) => ({ code, name }))}
              vatCodes={PICKABLE_VAT_CODES}
            />
          ) : (
            <p className={m.sub}>{r.status === 'rejected' ? 'Rejected.' : ''}</p>
          )}

          {access.canEdit && r.status !== 'posted' && (
            <div className={s.actions} style={{ marginTop: 16 }}>
              {(r.status !== 'processing' || stuck) && (
                <form action={rereadReceiptAction}>
                  <input type="hidden" name="receipt_id" value={r.id} />
                  <button className={f.btnGhost} type="submit">
                    Read again with AI
                  </button>
                </form>
              )}
              {r.status !== 'rejected' && (r.status !== 'processing' || stuck) && (
                <form action={rejectReceiptAction}>
                  <input type="hidden" name="receipt_id" value={r.id} />
                  <button className={f.btnGhost} type="submit">
                    Reject
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
      <p className={m.fine}>
        <Link className={s.link} href="/account/books/receipts">
          ← All receipts
        </Link>
      </p>
    </BooksFrame>
  );
}
