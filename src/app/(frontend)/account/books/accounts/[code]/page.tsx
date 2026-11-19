import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { allLines, getAccounts, loadLedger } from '@/lib/books/server';
import { isDebitNormal } from '@/lib/books/chart';
import { formatPence } from '@/lib/books/money';
import { isIsoDate, ukDate } from '@/lib/books/period';
import m from '../../../market/market.module.css';
import s from '../../books.module.css';
import { BooksFrame } from '../../BooksFrame';
import { DateFilter } from '../../DateFilter';

export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } };

/** One account's lines with the opening balance and a running balance. */
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { code } = await params;
  const access = await loadLedger(`/account/books/accounts/${code}`);
  const sp = await searchParams;
  const from = isIsoDate(sp.from) ? sp.from : null;
  const to = isIsoDate(sp.to) ? sp.to : null;
  const account = (await getAccounts(access.ledger.id)).find((a) => a.code === code);
  if (!account) notFound();

  const [lines, opening] = await Promise.all([
    allLines(access.ledger.id, { code, from, to }),
    from
      ? createServiceRoleClient()
          .rpc('books_account_opening', { p_ledger_id: access.ledger.id, p_code: code, p_before: from })
          .then(({ data }) => Number(data ?? 0))
      : Promise.resolve(0),
  ]);
  const sign = isDebitNormal(account.type) ? 1 : -1;
  let running = opening * sign;

  return (
    <BooksFrame access={access} title={`${account.code} ${account.name}`} tab="ledger" crumb={account.name}>
      {account.description && <p className={m.sub}>{account.description}</p>}
      <DateFilter from={from} to={to} />
      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Who</th>
              <th>Description</th>
              <th className={m.num}>Debit</th>
              <th className={m.num}>Credit</th>
              <th className={m.num}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {from && (
              <tr>
                <td>{ukDate(from)}</td>
                <td colSpan={4} className={s.muted}>
                  Opening balance
                </td>
                <td className={m.num}>{formatPence(running)}</td>
              </tr>
            )}
            {lines.map((l) => {
              running += (l.debit_pence - l.credit_pence) * sign;
              return (
                <tr key={l.line_id}>
                  <td>{ukDate(l.entry_date)}</td>
                  <td>{l.counterparty ?? ''}</td>
                  <td style={{ whiteSpace: 'normal' }}>{[l.description, l.memo].filter(Boolean).join(' · ')}</td>
                  <td className={m.num}>{formatPence(l.debit_pence, { blankZero: true })}</td>
                  <td className={m.num}>{formatPence(l.credit_pence, { blankZero: true })}</td>
                  <td className={m.num}>{formatPence(running)}</td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className={s.muted}>
                  Nothing on this account{from || to ? ' in these dates' : ' yet'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </BooksFrame>
  );
}
