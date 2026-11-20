import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger } from '@/lib/books/server';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { CustomersImport, TrialBalanceImport } from './ImportForms';

export const metadata: Metadata = { title: 'Bring your books over', robots: { index: false, follow: false } };

/**
 * Moving from Xero or FreshBooks: opening balances from their Trial Balance
 * report, and customers from their contacts / clients export. Both are files
 * the person downloads there and uploads here; nothing connects to their
 * account at the other app.
 */
export default async function BooksImportPage() {
  const access = await loadLedger('/account/books/import');
  if (!access.canEdit) redirect('/account/books');
  const accounts = (await getAccounts(access.ledger.id)).map(({ code, name, type }) => ({ code, name, type }));

  return (
    <BooksFrame access={access} title="Bring your books over" tab="settings" crumb="Import">
      <p className={m.lead}>
        Moving from Xero or FreshBooks? Bring your balances and customers with you. Download two files there and upload
        them here; nothing is connected to your old account and nothing there changes.
      </p>

      <h2 className={m.h2}>1. Opening balances</h2>
      <p className={m.sub}>
        Your old app’s trial balance becomes one journal here, so your bank, what you’re owed, what you owe and the
        year so far all carry on from where they were. Pick the day before you start keeping your books here; the end of
        your last financial year is tidiest.
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

      <h2 className={m.h2}>2. Customers</h2>
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
