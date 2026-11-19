import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadBooks, recentEntries, trialBalance } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { accountingYear, todayUk, ukDate } from '@/lib/books/period';
import f from '@/components/forms/forms.module.css';
import m from '../market/market.module.css';
import s from './books.module.css';
import { BooksFrame } from './BooksFrame';
import { SettingsForm } from './SettingsForm';
import { createLedgerAction } from './actions';

export const metadata: Metadata = { title: 'Books', robots: { index: false, follow: false } };

const POSTED: Record<string, string> = {
  sale: 'Sale recorded.',
  purchase: 'Expense recorded.',
  mileage: 'Mileage claim recorded.',
};

/**
 * Books home. No books yet: a Premium member sets them up here; anyone else
 * sees what Books is (on the web; the app never sells membership). With
 * books: bank balance, this year's figures, and the latest entries.
 */
export default async function BooksPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const access = await loadBooks('/account/books');
  const { posted } = await searchParams;

  if (!access.ledger) {
    if (!access.canEdit) {
      if (access.app) redirect('/invitations');
      return (
        <BooksFrame access={access} title="Books" tab={null}>
          <p className={m.lead}>
            <b>Premium members keep their books here.</b> Record sales and expenses, claim mileage at the
            HMRC rate, and see your profit and loss and trial balance at any time. Send in receipts and AI reads them into
            your books. Invoices customers can pay by card, VAT returns and bank statement matching are on the way.
          </p>
          <div className={m.pitch}>
            <h2>Part of Premium membership</h2>
            <p>
              Premium is £49 a month or £399 a year, and includes first look at every new job, the
              customer’s contact details on every invitation, market data, council tenders and Books.
            </p>
            <Link href="/account/membership">See the membership tiers →</Link>
          </div>
        </BooksFrame>
      );
    }
    return (
      <BooksFrame access={access} title="Set up your books" tab={null}>
        <p className={m.lead}>
          A proper double-entry set of books for your business. Tell us a little about it and we’ll set
          up the accounts. You can change everything except the business type later.
        </p>
        <SettingsForm
          action={createLedgerAction}
          setup
          paymentAccounts={[]}
          values={{
            business_type: 'sole_trader',
            legal_name: access.businessName,
            company_number: null,
            vat_registered: false,
            vat_number: null,
            vat_scheme: 'standard',
            vat_quarter_stagger: 0,
            flat_rate_percent: null,
            vat_registration_date: null,
            year_end: '04-05',
            farming: true,
            default_payment_account: '1200',
            trading_name: access.businessName,
            address: null,
            phone: null,
            invoice_reply_to: null,
            bank_details: null,
            invoice_terms_days: 7,
            invoice_footer: null,
            inbound_senders: [],
          }}
        />
      </BooksFrame>
    );
  }

  const ledger = access.ledger;
  const today = todayUk();
  const year = accountingYear(ledger.year_end, today);
  const [all, yearTb, entries, { count: toReview }] = await Promise.all([
    trialBalance(ledger.id),
    trialBalance(ledger.id, year.from, year.to),
    recentEntries(ledger.id, 25),
    createServiceRoleClient()
      .from('books_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('status', 'needs_review'),
  ]);
  const bal = (code: string) => {
    const r = all.find((a) => a.code === code);
    return r ? r.debit_pence - r.credit_pence : 0;
  };
  const income = yearTb.filter((r) => r.type === 'income').reduce((t, r) => t + r.credit_pence - r.debit_pence, 0);
  const expenses = yearTb.filter((r) => r.type === 'expense').reduce((t, r) => t + r.debit_pence - r.credit_pence, 0);

  return (
    <BooksFrame access={access} title="Books" tab="home">
      {posted && POSTED[posted] && <p className={s.notice}>{POSTED[posted]}</p>}
      {(toReview ?? 0) > 0 && (
        <p className={s.readOnly}>
          <b>{toReview} receipt{toReview === 1 ? '' : 's'} waiting for you.</b>{' '}
          <Link href="/account/books/receipts">Check {toReview === 1 ? 'it' : 'them'} →</Link>
        </p>
      )}

      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.tileLabel}>Bank (1200)</div>
          <div className={s.tileValue}>{formatPence(bal('1200'))}</div>
          <div className={s.tileHint}>As recorded in your books</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Income this year</div>
          <div className={s.tileValue}>{formatPence(income)}</div>
          <div className={s.tileHint}>
            {ukDate(year.from)} – {ukDate(year.to)}
          </div>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Expenses this year</div>
          <div className={s.tileValue}>{formatPence(expenses)}</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Profit this year</div>
          <div className={s.tileValue}>{formatPence(income - expenses)}</div>
          <div className={s.tileHint}>Before tax</div>
        </div>
      </div>

      {access.canEdit && (
        <div className={s.actions}>
          <Link className={f.btnPrimary} href="/account/books/new?kind=sale">
            Record sale
          </Link>
          <Link className={f.btnPrimary} href="/account/books/new?kind=purchase">
            Record expense
          </Link>
          <Link className={f.btnPrimary} href="/account/books/receipts">
            Add receipts
          </Link>
          <Link className={f.btnPrimary} href="/account/books/invoices/new">
            New invoice
          </Link>
          <Link className={f.btnGhost} href="/account/books/mileage">
            Claim mileage
          </Link>
        </div>
      )}

      <h2 className={m.h2}>Latest entries</h2>
      {entries.length === 0 ? (
        <p className={m.sub}>Nothing recorded yet. Start with a sale or an expense.</p>
      ) : (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Who</th>
                <th>Description</th>
                <th className={m.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{ukDate(e.entry_date)}</td>
                  <td>{e.source === 'mileage' ? 'Mileage' : e.kind === 'sale' ? 'Sale' : e.kind === 'purchase' ? 'Expense' : 'Journal'}</td>
                  <td>{e.counterparty ?? ''}</td>
                  <td style={{ whiteSpace: 'normal' }}>{e.description ?? ''}</td>
                  <td className={m.num}>{formatPence(e.kind === 'purchase' ? -e.gross_pence : e.gross_pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={m.fine}>
        <Link className={s.link} href="/account/books/journal">
          See every entry with its double-entry lines →
        </Link>
      </p>
    </BooksFrame>
  );
}
