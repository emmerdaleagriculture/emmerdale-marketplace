import type { Metadata } from 'next';
import Link from 'next/link';
import { loadLedger, trialBalance, type TbRow } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { accountingYear, isIsoDate, todayUk, ukDate } from '@/lib/books/period';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { DateFilter } from '../DateFilter';

export const metadata: Metadata = { title: 'Profit and loss', robots: { index: false, follow: false } };

/** Income and expense movement for a period; defaults to this accounting year. */
export default async function PnlPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; year?: string }> }) {
  const access = await loadLedger('/account/books/pnl');
  const sp = await searchParams;
  const today = todayUk();
  const thisYear = accountingYear(access.ledger.year_end, today);
  const lastYear = accountingYear(access.ledger.year_end, today, -1);
  const fallback = sp.year === 'last' ? lastYear : thisYear;
  const from = isIsoDate(sp.from) ? sp.from : fallback.from;
  const to = isIsoDate(sp.to) ? sp.to : fallback.to;
  const rows = await trialBalance(access.ledger.id, from, to);
  const income = rows.filter((r) => r.type === 'income' && (r.debit_pence || r.credit_pence));
  const expenses = rows.filter((r) => r.type === 'expense' && (r.debit_pence || r.credit_pence));
  const inc = (r: TbRow) => r.credit_pence - r.debit_pence;
  const exp = (r: TbRow) => r.debit_pence - r.credit_pence;
  const totalIncome = income.reduce((t, r) => t + inc(r), 0);
  const totalExpenses = expenses.reduce((t, r) => t + exp(r), 0);

  const section = (title: string, list: TbRow[], amount: (r: TbRow) => number, total: number) => (
    <>
      <tr>
        <th colSpan={2}>{title}</th>
      </tr>
      {list.map((r) => (
        <tr key={r.code}>
          <td>
            <Link className={s.link} href={`/account/books/accounts/${r.code}?from=${from}&to=${to}`}>
              {r.code}
            </Link>{' '}
            {r.name}
          </td>
          <td className={m.num}>{formatPence(amount(r))}</td>
        </tr>
      ))}
      {list.length === 0 && (
        <tr>
          <td colSpan={2} className={s.muted}>
            None
          </td>
        </tr>
      )}
      <tr className={s.totalRow}>
        <td>Total {title.toLowerCase()}</td>
        <td className={m.num}>{formatPence(total)}</td>
      </tr>
    </>
  );

  return (
    <BooksFrame access={access} title="Profit and loss" tab="pnl" crumb="Profit and loss">
      <p className={m.sub}>
        {ukDate(from)} to {ukDate(to)} ·{' '}
        <Link className={s.link} href="/account/books/pnl">
          This year
        </Link>{' '}
        ·{' '}
        <Link className={s.link} href="/account/books/pnl?year=last">
          Last year
        </Link>
      </p>
      <DateFilter from={from} to={to} />
      <div className={m.tableWrap}>
        <table className={m.table}>
          <tbody>
            {section('Income', income, inc, totalIncome)}
            {section('Expenses', expenses, exp, totalExpenses)}
            <tr className={s.totalRow}>
              <td>{totalIncome - totalExpenses >= 0 ? 'Profit' : 'Loss'} before tax</td>
              <td className={m.num}>{formatPence(totalIncome - totalExpenses)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={m.fine}>
        Equipment and vehicles bought as fixed assets aren’t expenses here; they’re claimed through capital
        allowances on your tax return. Ask your accountant how to treat them.
      </p>
    </BooksFrame>
  );
}
