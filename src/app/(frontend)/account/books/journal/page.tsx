import type { Metadata } from 'next';
import { loadLedger, recentEntries } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { voidEntryAction } from '../actions';

export const metadata: Metadata = { title: 'Journal', robots: { index: false, follow: false } };

const LIMIT = 500;

/** The latest entries with their double-entry lines. */
export default async function JournalPage() {
  const access = await loadLedger('/account/books/journal');
  const entries = await recentEntries(access.ledger.id, LIMIT);
  return (
    <BooksFrame access={access} title="Journal" tab="journal" crumb="Journal">
      <p className={m.sub}>
        Every entry, newest first, with the accounts it posted to.
        {entries.length === LIMIT ? ` Showing the latest ${LIMIT}; download the CSV from the trial balance for everything.` : ''}
      </p>
      {entries.length === 0 && <p className={m.sub}>Nothing recorded yet.</p>}
      {entries.map((e) => (
        <div key={e.id} className={s.entry}>
          <div className={s.entryHead}>
            <span>
              <b>{ukDate(e.entry_date)}</b> · {e.counterparty ?? (e.kind === 'journal' ? 'Journal' : '')}
              {e.reference ? ` · ${e.reference}` : ''}
            </span>
            <span className={s.muted}>
              #{e.id} · {e.vat_code}
              {access.canEdit && (e.source === 'manual' || e.source === 'mileage' || e.source === 'receipt') && (
                <form action={voidEntryAction} style={{ display: 'inline', marginLeft: 10 }}>
                  <input type="hidden" name="entry_id" value={e.id} />
                  <button className={s.voidBtn} type="submit">
                    Void
                  </button>
                </form>
              )}
            </span>
          </div>
          {e.description && <div className={s.muted}>{e.description}</div>}
          <table className={s.entryLines}>
            <tbody>
              {e.books_lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.books_accounts?.code} {l.books_accounts?.name}
                    {l.memo ? <span className={s.muted}> · {l.memo}</span> : null}
                  </td>
                  <td className={m.num}>{formatPence(l.debit_pence, { blankZero: true })}</td>
                  <td className={m.num}>{formatPence(l.credit_pence, { blankZero: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </BooksFrame>
  );
}
