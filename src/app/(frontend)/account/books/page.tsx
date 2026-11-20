import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadBooks, recentEntries, trialBalance } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { accountingYear, todayUk, ukDate } from '@/lib/books/period';
import m from '../market/market.module.css';
import s from './books.module.css';
import { BooksFrame } from './BooksFrame';
import { Icon, Tile, Tiles } from './BooksUi';
import { SettingsForm } from './SettingsForm';
import { BooksPreview } from './BooksPreview';
import { createLedgerAction } from './actions';
import { syncLedgerMarketplace } from '@/lib/books/marketplace.server';

export const metadata: Metadata = { title: 'Books', robots: { index: false, follow: false } };

const POSTED: Record<string, string> = {
  sale: 'Sale recorded.',
  purchase: 'Expense recorded.',
  mileage: 'Mileage claim recorded.',
};

/**
 * Books home. No books yet: a Premium member sets them up here; anyone else
 * sees the page with sample figures under a Premium overlay (BooksPreview). With
 * books: bank balance, this year's figures, and the latest entries.
 */
export default async function BooksPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const access = await loadBooks('/account/books');
  const { posted } = await searchParams;

  if (!access.ledger) {
    if (!access.canEdit) {
      // Without Premium: the page as members see it, faded under a Premium card.
      return (
        <BooksFrame access={access} title="Books" tab={null}>
          <BooksPreview app={access.app} />
        </BooksFrame>
      );
    }
    return (
      <BooksFrame access={access} title="Set up your books" tab={null}>
        <p className={m.lead}>
          A proper double-entry set of books for your business. Tell us a little about it and we’ll set
          up the accounts. You can change any of it later in Settings.
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
            marketplace_auto: true,
            marketplace_from: null,
          }}
        />
      </BooksFrame>
    );
  }

  const ledger = access.ledger;
  // Signed-off Emmerdale jobs and our payouts, booked as they happen (the nightly cron catches the rest).
  if (access.canEdit && ledger.marketplace_auto) {
    try {
      await syncLedgerMarketplace(ledger);
    } catch (err) {
      console.error('[books] marketplace sync on visit failed', { ledger: ledger.id, error: err instanceof Error ? err.message : err });
    }
  }
  const today = todayUk();
  const year = accountingYear(ledger.year_end, today);
  const admin = createServiceRoleClient();
  const [all, yearTb, entries, { count: toReview }, { data: overdueRows }] = await Promise.all([
    trialBalance(ledger.id),
    trialBalance(ledger.id, year.from, year.to),
    recentEntries(ledger.id, 12),
    admin.from('books_receipts').select('id', { count: 'exact', head: true }).eq('ledger_id', ledger.id).eq('status', 'needs_review'),
    admin.from('books_invoices').select('gross_pence, paid_pence').eq('ledger_id', ledger.id).eq('status', 'issued').lt('due_date', today).limit(1000),
  ]);
  const bal = (code: string) => {
    const r = all.find((a) => a.code === code);
    return r ? r.debit_pence - r.credit_pence : 0;
  };
  const income = yearTb.filter((r) => r.type === 'income').reduce((t, r) => t + r.credit_pence - r.debit_pence, 0);
  const expenses = yearTb.filter((r) => r.type === 'expense').reduce((t, r) => t + r.debit_pence - r.credit_pence, 0);
  const profit = income - expenses;
  const overdue = (overdueRows ?? []).filter((i) => i.gross_pence > i.paid_pence);
  const overdueTotal = overdue.reduce((t, i) => t + i.gross_pence - i.paid_pence, 0);
  const kindOf = (e: (typeof entries)[number]) =>
    e.source === 'mileage' ? 'Mileage' : e.source === 'marketplace' && e.kind === 'sale' ? 'Emmerdale job' : e.kind === 'sale' ? 'Sale' : e.kind === 'purchase' ? 'Expense' : 'Journal';

  return (
    <BooksFrame access={access} title="Books" tab="home">
      {posted && POSTED[posted] && <p className={s.notice}>{POSTED[posted]}</p>}

      {/* What needs doing comes first. */}
      {((toReview ?? 0) > 0 || overdue.length > 0) && (
        <div className={s.attention}>
          {(toReview ?? 0) > 0 && (
            <Link href="/account/books/receipts">
              <span>
                <b>
                  {toReview} receipt{toReview === 1 ? '' : 's'}
                </b>{' '}
                waiting for you to check
              </span>
              <Icon name="arrow" size={18} />
            </Link>
          )}
          {overdue.length > 0 && (
            <Link href="/account/books/invoices?show=open">
              <span>
                <b>
                  {overdue.length} invoice{overdue.length === 1 ? '' : 's'} overdue
                </b>{' '}
                · {formatPence(overdueTotal)} owed
              </span>
              <Icon name="arrow" size={18} />
            </Link>
          )}
        </div>
      )}

      {/* New books: offer to bring the old ones over. */}
      {access.canEdit && entries.length < 12 && !entries.some((e) => String(e.external_id ?? '').startsWith('import:opening:')) && (
        <p className={s.notice}>
          Moving from Xero or FreshBooks?{' '}
          <Link className={s.link} href="/account/books/import">
            Bring your balances and customers over →
          </Link>
        </p>
      )}

      <Tiles>
        <Tile icon="bank" label="Bank (1200)" value={formatPence(bal('1200'))} hint="As recorded in your books" tone="teal" />
        <Tile icon="coins" label="Income this year" value={formatPence(income)} hint={`${ukDate(year.from)} – ${ukDate(year.to)}`} tone="green" />
        <Tile icon="expenses" label="Expenses this year" value={formatPence(expenses)} tone="amber" />
        <Tile icon="trend" label="Profit this year" value={formatPence(profit)} hint="Before tax" tone={profit < 0 ? 'red' : 'green'} />
      </Tiles>

      {access.canEdit && (
        <div className={s.actionGrid}>
          <Link className={s.actionMain} href="/account/books/new?kind=sale">
            <Icon name="plus" size={22} />
            <span>Record sale</span>
          </Link>
          <Link className={s.actionMain} href="/account/books/new?kind=purchase">
            <Icon name="minus" size={22} />
            <span>Record expense</span>
          </Link>
          <Link className={s.actionSecond} href="/account/books/receipts">
            <Icon name="camera" />
            <span>Add receipts</span>
          </Link>
          <Link className={s.actionSecond} href="/account/books/invoices/new">
            <Icon name="invoice" />
            <span>New invoice</span>
          </Link>
          <Link className={s.actionThird} href="/account/books/mileage">
            <Icon name="car" size={20} />
            <span>Claim mileage</span>
          </Link>
          <Link className={s.actionThird} href="/account/books/bank">
            <Icon name="bank" size={20} />
            <span>Bank statement</span>
          </Link>
        </div>
      )}

      <div className={s.sectionHead}>
        <h2>Latest entries</h2>
        <Link href="/account/books/journal">
          View all <Icon name="arrow" size={16} />
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className={m.sub}>Nothing recorded yet. Start with a sale or an expense.</p>
      ) : (
        <ul className={s.entryList}>
          {entries.map((e) => {
            const amount = e.kind === 'purchase' ? -e.gross_pence : e.gross_pence;
            return (
              <li key={e.id}>
                <span className={s.entryWho}>{e.counterparty || e.description || kindOf(e)}</span>
                <span className={s.entryAmount} data-in={e.kind === 'sale' && amount > 0 ? '' : undefined}>
                  {formatPence(amount)}
                </span>
                <span className={s.entryMeta}>
                  {ukDate(e.entry_date)} · {kindOf(e)}
                  {e.counterparty && e.description ? ` · ${e.description}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </BooksFrame>
  );
}
