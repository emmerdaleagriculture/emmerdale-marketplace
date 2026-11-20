import type { Metadata } from 'next';
import Link from 'next/link';
import { loadLedger, trialBalance } from '@/lib/books/server';
import { isDebitNormal, type AccountType } from '@/lib/books/chart';
import { formatPence } from '@/lib/books/money';
import { isIsoDate } from '@/lib/books/period';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { DateFilter } from '../DateFilter';
import { AddAccountForm } from './AddAccountForm';

export const metadata: Metadata = { title: 'Trial balance', robots: { index: false, follow: false } };

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];

/** Every account with its debits, credits and balance, optionally for a date range. */
export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; imported?: string }> }) {
  const access = await loadLedger('/account/books/ledger');
  const sp = await searchParams;
  const from = isIsoDate(sp.from) ? sp.from : null;
  const to = isIsoDate(sp.to) ? sp.to : null;
  const rows = await trialBalance(access.ledger.id, from, to);
  const shown = rows
    .filter((r) => r.debit_pence || r.credit_pence)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type as AccountType) - TYPE_ORDER.indexOf(b.type as AccountType) || a.code.localeCompare(b.code));
  const dr = rows.reduce((t, r) => t + r.debit_pence, 0);
  const cr = rows.reduce((t, r) => t + r.credit_pence, 0);
  const q = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  return (
    <BooksFrame access={access} title="Trial balance" tab="ledger" crumb="Trial balance">
      {sp.imported != null && (
        <p className={s.notice}>
          Opening balances brought in
          {Number(sp.imported) > 0 ? `, with ${Number(sp.imported)} new account${Number(sp.imported) === 1 ? '' : 's'}` : ''}. Check the
          balances below against the report you exported. Got something wrong? Void the journal on
          the <Link className={s.link} href="/account/books/journal">journal</Link> page and import again.
        </p>
      )}
      <DateFilter from={from} to={to} />
      {shown.length === 0 ? (
        <p className={m.sub}>Nothing posted {from || to ? 'in these dates' : 'yet'}.</p>
      ) : (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th className={m.num}>Debits</th>
                <th className={m.num}>Credits</th>
                <th className={m.num}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const bal = isDebitNormal(r.type as AccountType) ? r.debit_pence - r.credit_pence : r.credit_pence - r.debit_pence;
                return (
                  <tr key={r.code}>
                    <td>
                      <Link className={s.link} href={`/account/books/accounts/${r.code}${q ? `?${q}` : ''}`}>
                        {r.code}
                      </Link>
                    </td>
                    <td>{r.name}</td>
                    <td className={s.muted}>{r.type}</td>
                    <td className={m.num}>{formatPence(r.debit_pence, { blankZero: true })}</td>
                    <td className={m.num}>{formatPence(r.credit_pence, { blankZero: true })}</td>
                    <td className={m.num}>{formatPence(bal)}</td>
                  </tr>
                );
              })}
              <tr className={s.totalRow}>
                <td colSpan={3}>Totals{dr === cr ? '' : ' — DO NOT BALANCE'}</td>
                <td className={m.num}>{formatPence(dr)}</td>
                <td className={m.num}>{formatPence(cr)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className={m.fine}>
        Balances are shown the natural way round: assets and expenses as debits, everything else as credits.{' '}
        <a className={s.link} href={`/account/books/ledger.csv${q ? `?${q}` : ''}`}>
          Download the general ledger (CSV)
        </a>
      </p>

      <h2 className={m.h2}>All accounts</h2>
      <div className={m.tableWrap}>
        <table className={m.table}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>
                  <Link className={s.link} href={`/account/books/accounts/${r.code}`}>
                    {r.code}
                  </Link>
                </td>
                <td>{r.name}</td>
                <td className={s.muted}>
                  {r.type}
                  {r.is_fixed_asset ? ' · fixed asset' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {access.canEdit && (
        <>
          <h2 className={m.h2}>Add an account</h2>
          <AddAccountForm />
        </>
      )}
    </BooksFrame>
  );
}
