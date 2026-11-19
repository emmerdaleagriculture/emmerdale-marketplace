import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { nonContractorPath } from '@/lib/auth';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDate } from '@/lib/time';
import { AppHero, Seg, Tile, Tiles } from '@/components/app/AppKit';
import { taxYearOf } from '@/lib/books/taxRates';
import ui from '../app-ui.module.css';
import { todayInLondon } from '../diary/diary';

export const metadata: Metadata = { title: 'Earnings', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The contractor's Earnings tab (PRD task 9): what is on its way, then the
 * recent jobs with what the customer paid, our fee and what they get. Paid
 * means we have sent it; held means the customer has yet to sign off or
 * settle, or the invoice is missing. Nothing about membership here (the
 * dashboard shows a member their plan); never a price, button or pointer to
 * buying one in the app (Apple 3.1.1).
 */
export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const v = (await searchParams).v;
  const view = v === 'payouts' || v === 'invoices' ? v : 'all';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/app');
  const { data: me } = await supabase.from('contractors').select('id, business_name, status').eq('id', user.id).maybeSingle();
  if (!me) redirect(await nonContractorPath(user.id));

  const admin = createServiceRoleClient();
  // The tax year so far (6 April on), for the paid and won figures.
  const yearFrom = `${taxYearOf(todayInLondon())}-04-06`;
  const [{ data: won }, { data: ready }, { data: bank }, { data: thisYear }] = await Promise.all([
    supabase
      .from('my_sq_won_jobs')
      .select('id, service, status, postcode, contractor_price_pence, awarded_at, contractor_invoice_at, paid_out_on, paid_out_pence')
      .order('awarded_at', { ascending: false })
      .limit(30),
    admin.from('sq_payout_ready').select('submission_id, owed_pence, collected_pence, total_pence, contractor_invoice_at, status, payout_before_balance').eq('contractor_id', user.id),
    admin.from('contractor_bank_details').select('account_number').eq('contractor_id', user.id).maybeSingle(),
    supabase.from('my_sq_won_jobs').select('awarded_at, paid_out_on, paid_out_pence').or(`awarded_at.gte.${yearFrom},paid_out_on.gte.${yearFrom}`).limit(1000),
  ]);
  const paidThisYear = (thisYear ?? []).reduce((n, j) => n + (j.paid_out_on && j.paid_out_on >= yearFrom ? (j.paid_out_pence ?? 0) : 0), 0);
  const wonThisYear = (thisYear ?? []).filter((j) => (j.awarded_at ?? '') >= yearFrom).length;

  // The customer's figure for each job, for the gross / fee / net lines.
  const ids = (won ?? []).map((j) => j.id).filter((x): x is string => !!x);
  const { data: quotes } = ids.length
    ? await admin.from('client_quotes').select('submission_id, client_price_pence').in('submission_id', ids).eq('status', 'accepted')
    : { data: [] as { submission_id: string; client_price_pence: number }[] };
  const gross = new Map((quotes ?? []).map((q) => [q.submission_id, q.client_price_pence]));

  const paidOutIds = new Set((won ?? []).filter((j) => j.paid_out_on).map((j) => j.id));
  // One row per job: the view joins every quote the contractor sent, so a
  // revised price would otherwise count twice.
  const owed = [...new Map((ready ?? []).filter((r) => !paidOutIds.has(r.submission_id)).map((r) => [r.submission_id, r])).values()];
  // Ready as the admin money screen reads it: invoice in, and the balance
  // collected unless this contractor is paid before the balance.
  const releasable = owed.filter((r) => r.contractor_invoice_at && (r.payout_before_balance || (r.collected_pence ?? 0) >= (r.total_pence ?? 0)));
  const nextPayout = releasable.reduce((n, r) => n + (r.owed_pence ?? 0), 0);
  const held = owed.reduce((n, r) => n + (r.owed_pence ?? 0), 0) - nextPayout;

  // Market data moved to the Premium panel on the dashboard, and the
  // membership card left this screen (2026-11-19): Earnings is just money.

  const label = (j: NonNullable<typeof won>[number]) =>
    j.paid_out_on ? 'Paid' : j.status === 'completed_by_contractor' ? 'Waiting for sign-off' : ['completed', 'paid'].includes(j.status ?? '') ? (j.contractor_invoice_at ? 'Payout due' : 'Send your invoice') : 'Booked';

  // Payouts: what we have sent. Invoices: finished jobs not yet paid out,
  // whether the invoice is still to send or in and waiting.
  const list = (won ?? []).filter((j) =>
    view === 'payouts' ? !!j.paid_out_on : view === 'invoices' ? !j.paid_out_on && ['completed', 'paid'].includes(j.status ?? '') : true,
  );

  return (
    <main className={ui.screen}>
      <AppHero photo="earnings" name={bank?.account_number ? `Paid to •••• ${bank.account_number.slice(-4)}` : 'Your money'} title="Earnings" />

      {/* No "Your dashboard" row: the dashboard has its own tab (2026-11-19). */}
      <Tiles>
        <Tile icon="pound" tone="green" label="Ready to pay out" value={formatGBP(nextPayout)} hint={nextPayout > 0 ? 'Invoice in, customer paid' : 'Nothing ready yet'} />
        <Tile icon="clock" tone="amber" label="Held" value={formatGBP(held)} hint="Until sign-off, balance or invoice" />
        <Tile icon="trend" tone="teal" label="Paid this tax year" value={formatGBP(paidThisYear)} hint="Since 6 April" />
        <Tile icon="check" tone="teal" label="Jobs won" value={wonThisYear} hint="Since 6 April" />
      </Tiles>

      <Seg
        label="Earnings"
        items={[
          { href: '/app/earnings', label: 'Overview', current: view === 'all' },
          { href: '/app/earnings?v=payouts', label: 'Payouts', current: view === 'payouts' },
          { href: '/app/earnings?v=invoices', label: 'Invoices', current: view === 'invoices' },
        ]}
      />

      <div className={ui.sectionHead}>
        <h2 className={ui.sectionTitle}>{view === 'payouts' ? 'Paid to you' : view === 'invoices' ? 'Done, not yet paid out' : 'Recent jobs'}</h2>
        <Link href="/won" className={ui.sectionLink}>Won jobs</Link>
      </div>
      {list.length === 0 ? (
        <div className={ui.card} style={{ color: 'var(--ink-2)' }}>
          {view === 'payouts'
            ? 'No payouts yet. Once a customer has paid in full and your invoice is in, we pay you and it shows here.'
            : view === 'invoices'
              ? 'Nothing waiting on an invoice or a payout.'
              : 'No won jobs yet. Price the jobs that come in and they’ll appear here.'}
        </div>
      ) : (
        <div className={ui.rows}>
          {list.map((j) => {
            const g = j.id ? gross.get(j.id) : undefined;
            const net = j.contractor_price_pence ?? 0;
            const fee = g != null && net > 0 ? g - net : null;
            return (
              <div key={j.id} className={ui.row} style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className={ui.cardTitle}>{j.service}</div>
                  <div className={ui.cardSub}>{[j.postcode?.split(' ')[0], label(j), j.awarded_at ? formatDate(j.awarded_at) : null].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={ui.rowValue} style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <strong style={{ color: 'var(--jd-green-deep)', fontSize: 16 }}>{formatGBP(j.paid_out_pence ?? net)}</strong>
                  <span>{fee != null && g ? `customer paid ${formatGBP(g)} · fee ${formatGBP(fee)}` : g ? `customer paid ${formatGBP(g)}` : j.paid_out_on ? 'paid' : 'held'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}
