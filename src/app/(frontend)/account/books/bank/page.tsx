import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { statementAccounts } from '@/lib/books/bank.server';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { UploadForm } from './UploadForm';

export const metadata: Metadata = { title: 'Bank statements', robots: { index: false, follow: false } };

/**
 * Bank statements: upload a CSV from the bank, then tick the rows to bring
 * into the books. Coverage per account shows how far the books are checked
 * against the bank.
 */
export default async function BankPage() {
  const access = await loadLedger('/account/books/bank');
  const l = access.ledger;
  const [accounts, { data: statements }] = await Promise.all([
    getAccounts(l.id),
    createServiceRoleClient()
      .from('books_bank_statements')
      .select('id, account_code, file_name, start_date, end_date, row_count, closing_balance_pence, created_at')
      .eq('ledger_id', l.id)
      .order('end_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(500),
  ]);
  const banks = statementAccounts(accounts);
  const name = new Map(accounts.map((a) => [a.code, a.name]));
  const covered = new Map<string, string>();
  for (const st of statements ?? []) if (!covered.has(st.account_code) || st.end_date > covered.get(st.account_code)!) covered.set(st.account_code, st.end_date);

  return (
    <BooksFrame access={access} title="Bank statements" tab="bank" crumb="Bank">
      <p className={m.lead}>
        Download a statement from your bank as a CSV file and upload it here. You choose which rows to bring
        into your books; anything already there (a receipt, an invoice payment, a Stripe payout) is spotted
        and left out.
      </p>

      {covered.size > 0 && (
        <div className={s.tiles}>
          {[...covered].map(([code, end]) => (
            <div className={s.tile} key={code}>
              <div className={s.tileLabel}>
                {code} {name.get(code) ?? ''}
              </div>
              <div className={s.tileValue}>{ukDate(end)}</div>
              <div className={s.tileHint}>Statements uploaded up to</div>
            </div>
          ))}
        </div>
      )}

      {access.canEdit && (
        <>
          <h2 className={m.h2}>Upload a statement</h2>
          <UploadForm accounts={banks.map(({ code, name }) => ({ code, name }))} defaultCode={l.default_payment_account} />
          <p className={m.fine}>
            Monzo, Starling, Barclays, Lloyds, NatWest, HSBC, Nationwide, Santander, Tide and most other UK
            banks’ CSV exports work. PDF statements can’t be read. Need another account, like a second bank or
            a card? Add it on the <Link className={s.link} href="/account/books/ledger">trial balance</Link> page
            with a code from 1200 to 1299.
          </p>
        </>
      )}

      <h2 className={m.h2}>Uploaded statements</h2>
      {!statements?.length ? (
        <p className={m.sub}>None yet.</p>
      ) : (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Dates</th>
                <th className={m.num}>Rows</th>
                <th className={m.num}>Closing balance</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((st) => (
                <tr key={st.id}>
                  <td>
                    {st.account_code} {name.get(st.account_code) ?? ''}
                  </td>
                  <td>
                    <Link className={s.link} href={`/account/books/bank/${st.id}`}>
                      {ukDate(st.start_date)} – {ukDate(st.end_date)}
                    </Link>
                  </td>
                  <td className={m.num}>{st.row_count}</td>
                  <td className={m.num}>{st.closing_balance_pence == null ? '—' : formatPence(st.closing_balance_pence)}</td>
                  <td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{st.file_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BooksFrame>
  );
}
