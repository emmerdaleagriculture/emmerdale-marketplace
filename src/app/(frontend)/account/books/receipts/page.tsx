import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLedger } from '@/lib/books/server';
import { MONTHLY_AI_READS } from '@/lib/books/receipts.server';
import { receiptsAddress } from '@/lib/books/inbound';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { ReceiptUploader } from './ReceiptUploader';
import { AutoRefresh } from './AutoRefresh';

export const metadata: Metadata = { title: 'Receipts', robots: { index: false, follow: false } };
// The upload's AI read runs after the response (after()); give it room.
export const maxDuration = 300;

type Row = {
  id: number;
  status: string;
  file_name: string | null;
  received_at: string;
  doc_date: string | null;
  counterparty: string | null;
  gross_pence: number | null;
  review_reasons: string | null;
  doc_type: string | null;
};

/** The review queue, receipts being read, and the latest posted. */
export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const access = await loadLedger('/account/books/receipts');
  const { posted } = await searchParams;
  const admin = createServiceRoleClient();
  const cols = 'id, status, file_name, received_at, doc_date, counterparty, gross_pence, review_reasons, doc_type';
  const [{ data: open }, { data: done }, { data: used }] = await Promise.all([
    admin
      .from('books_receipts')
      .select(cols)
      .eq('ledger_id', access.ledger.id)
      .in('status', ['processing', 'needs_review'])
      .order('received_at', { ascending: true })
      .limit(500),
    admin
      .from('books_receipts')
      .select(cols)
      .eq('ledger_id', access.ledger.id)
      .eq('status', 'posted')
      .order('updated_at', { ascending: false })
      .limit(25),
    admin.rpc('books_ai_reads_this_month', { p_ledger_id: access.ledger.id }),
  ]);
  const reading = ((open ?? []) as Row[]).filter((r) => r.status === 'processing');
  const review = ((open ?? []) as Row[]).filter((r) => r.status === 'needs_review');

  const table = (rows: Row[], showReason: boolean) => (
    <div className={m.tableWrap}>
      <table className={m.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>From</th>
            <th className={m.num}>Total</th>
            {showReason && <th>Why it’s waiting</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className={s.link} href={`/account/books/receipts/${r.id}`}>
                  {r.doc_date ? ukDate(r.doc_date) : ukDate(r.received_at.slice(0, 10))}
                </Link>
              </td>
              <td style={{ whiteSpace: 'normal' }}>{r.counterparty ?? r.file_name ?? `Receipt #${r.id}`}</td>
              <td className={m.num}>{r.gross_pence != null ? formatPence(r.doc_type === 'sale' ? r.gross_pence : -r.gross_pence) : ''}</td>
              {showReason && (
                <td style={{ whiteSpace: 'normal' }} className={s.muted}>
                  {(r.review_reasons ?? '').split('\n')[0]}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <BooksFrame access={access} title="Receipts" tab="receipts" crumb="Receipts">
      <AutoRefresh active={reading.length > 0} />
      {posted && <p className={s.notice}>Receipt posted to your books.</p>}
      {access.canEdit && <ReceiptUploader />}
      {access.canEdit && (
        <p className={m.sub}>
          Or email them to <b>{receiptsAddress(access.ledger.inbound_code)}</b> from your own address. Other senders can
          be added in <Link className={s.link} href="/account/books/settings">Settings</Link>.
        </p>
      )}

      {reading.length > 0 && (
        <>
          <h2 className={m.h2}>Reading now ({reading.length})</h2>
          <p className={m.sub}>Usually under a minute each. This page updates by itself.</p>
          {table(reading, false)}
        </>
      )}

      <h2 className={m.h2}>Waiting for you ({review.length})</h2>
      {review.length === 0 ? <p className={m.sub}>Nothing to check. Everything read has been posted.</p> : table(review, true)}

      <h2 className={m.h2}>Recently posted</h2>
      {(done ?? []).length === 0 ? <p className={m.sub}>Nothing posted from receipts yet.</p> : table((done ?? []) as Row[], false)}

      <p className={m.fine}>
        {used ?? 0} of {MONTHLY_AI_READS} AI reads used this month. Duplicates of a file already in your books aren’t
        read again.
      </p>
    </BooksFrame>
  );
}
