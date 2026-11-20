import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { businessTypeOf, getAccounts, loadLedger } from '@/lib/books/server';
import { accountingYear, addDays, todayUk } from '@/lib/books/period';
import { equityCodeFor, startingAccounts } from '@/lib/books/startingAccounts';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { CustomersImport, TrialBalanceImport } from './ImportForms';
import { StartingBalancesForm } from './StartingBalancesForm';

export const metadata: Metadata = { title: 'Starting balances', robots: { index: false, follow: false } };

/**
 * Where the books start: starting balances typed in by hand, or brought over
 * from Xero or FreshBooks (their Trial Balance report), plus customers from
 * their contacts / clients export. The files are downloaded there and
 * uploaded here; nothing connects to their account at the other app.
 */
export default async function BooksImportPage() {
  const access = await loadLedger('/account/books/import');
  if (!access.canEdit) redirect('/account/books');
  const all = await getAccounts(access.ledger.id);
  const accounts = all.map(({ code, name, type }) => ({ code, name, type }));
  const starting = startingAccounts(all).map(({ code, name, type, is_fixed_asset }) => ({ code, name, type, is_fixed_asset }));
  const equityCode = equityCodeFor(businessTypeOf(access.ledger));
  const equity = all.find((a) => a.code === equityCode);
  // The end of the last accounting year: the tidiest place to start.
  const lastYearEnd = addDays(accountingYear(access.ledger.year_end, todayUk()).from, -1);

  return (
    <BooksFrame access={access} title="Starting balances" tab="settings" crumb="Starting balances">
      <p className={m.lead}>
        Your books start from zero. If the business was already going, tell them where things stood on the day you
        start: what’s in the bank, what you’re owed and what you owe. Type the figures in, or bring them over from Xero
        or FreshBooks.
      </p>

      <h2 className={m.h2}>1. Starting balances</h2>
      <h3 className={m.h2} style={{ fontSize: '1.05rem' }}>Type them in</h3>
      <p className={m.sub}>
        Fill in what applies and leave the rest blank. Your bank statement, your list of unpaid invoices and bills, and
        your last accounts (if you have them) have everything you need.
      </p>
      <StartingBalancesForm
        accounts={starting}
        defaultDate={lastYearEnd}
        equityName={equity ? `${equity.code} ${equity.name}` : equityCode}
      />

      <h3 className={m.h2} style={{ fontSize: '1.05rem' }}>Or bring them over from Xero or FreshBooks</h3>
      <p className={m.sub}>
        Your old app’s trial balance becomes one journal here, so your bank, what you’re owed, what you owe and the
        year so far all carry on from where they were. Pick the day before you start keeping your books here; the end of
        your last financial year is tidiest. Nothing is connected to your old account and nothing there changes.
      </p>
      <ul className={m.sub}>
        <li>
          <b>Xero:</b> Accounting → Reports → Trial Balance. Set the date, click Update, then Export → Excel.
        </li>
        <li>
          <b>FreshBooks:</b> Reports → Trial Balance. Set the end date, then export it as CSV or Excel. (FreshBooks only
          has this report on its Plus plan and above.)
        </li>
      </ul>
      <TrialBalanceImport accounts={accounts} />

      <h2 className={m.h2}>2. Customers from Xero or FreshBooks</h2>
      <p className={m.sub}>
        Adds them to your <Link className={s.link} href="/account/books/customers">customers</Link> so you can invoice them
        straight away. Anyone already there with the same name is left as they are.
      </p>
      <ul className={m.sub}>
        <li>
          <b>Xero:</b> Contacts → All contacts → Export (CSV).
        </li>
        <li>
          <b>FreshBooks:</b> Clients → More actions → Export to CSV.
        </li>
      </ul>
      <CustomersImport />

      <h2 className={m.h2}>Transactions after that date</h2>
      <p className={m.sub}>
        Upload your bank statements from the opening balance date on the <Link className={s.link} href="/account/books/bank">Bank</Link> page.
        Invoices still unpaid in your old app are in the opening balance as money owed to you; when they’re paid, match the
        bank row to <b>1100 Trade debtors</b>.
      </p>
    </BooksFrame>
  );
}
