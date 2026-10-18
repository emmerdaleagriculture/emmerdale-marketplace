import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { nonContractorPath } from '@/lib/auth';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDate } from '@/lib/time';
import ui from '../app-ui.module.css';

export const metadata: Metadata = { title: 'Earnings', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The contractor's Earnings tab (PRD task 9): what is on its way, then the
 * recent jobs with what the customer paid, our fee and what they get. Paid
 * means we have sent it; held means the customer has yet to sign off or
 * settle, or the invoice is missing. Premium shows its status and benefits
 * only — joining is on the website (store rules).
 */
export default async function EarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/app');
  const { data: me } = await supabase.from('contractors').select('id, business_name, status').eq('id', user.id).maybeSingle();
  if (!me) redirect(await nonContractorPath(user.id));

  const admin = createServiceRoleClient();
  const [{ data: won }, { data: ready }, { data: premium }, { data: bank }] = await Promise.all([
    supabase
      .from('my_sq_won_jobs')
      .select('id, service, status, postcode, contractor_price_pence, awarded_at, contractor_invoice_at, paid_out_on, paid_out_pence')
      .order('awarded_at', { ascending: false })
      .limit(30),
    admin.from('sq_payout_ready').select('submission_id, owed_pence, collected_pence, total_pence, contractor_invoice_at, status').eq('contractor_id', user.id),
    admin.rpc('contractor_is_premium', { p_contractor_id: user.id }),
    admin.from('contractor_bank_details').select('account_number').eq('contractor_id', user.id).maybeSingle(),
  ]);

  // The customer's figure for each job, for the gross / fee / net lines.
  const ids = (won ?? []).map((j) => j.id).filter((x): x is string => !!x);
  const { data: quotes } = ids.length
    ? await admin.from('client_quotes').select('submission_id, client_price_pence').in('submission_id', ids).eq('status', 'accepted')
    : { data: [] as { submission_id: string; client_price_pence: number }[] };
  const gross = new Map((quotes ?? []).map((q) => [q.submission_id, q.client_price_pence]));

  const paidOutIds = new Set((won ?? []).filter((j) => j.paid_out_on).map((j) => j.id));
  const owed = (ready ?? []).filter((r) => !paidOutIds.has(r.submission_id));
  const releasable = owed.filter((r) => r.contractor_invoice_at && (r.collected_pence ?? 0) >= (r.total_pence ?? 0));
  const nextPayout = releasable.reduce((n, r) => n + (r.owed_pence ?? 0), 0);
  const held = owed.reduce((n, r) => n + (r.owed_pence ?? 0), 0) - nextPayout;

  const label = (j: NonNullable<typeof won>[number]) =>
    j.paid_out_on ? 'Paid' : j.status === 'completed_by_contractor' ? 'Waiting for sign-off' : ['completed', 'paid'].includes(j.status ?? '') ? (j.contractor_invoice_at ? 'Payout due' : 'Send your invoice') : 'Booked';

  return (
    <main className={ui.screen}>
      <h1 className={ui.title}>Earnings</h1>

      <div className={ui.card} style={{ background: 'var(--jd-green-deep)', color: '#fff', border: 0 }}>
        <div style={{ fontSize: 14, opacity: 0.85 }}>{nextPayout > 0 ? 'Ready to pay out' : 'Nothing ready to pay out yet'}</div>
        <div style={{ fontFamily: 'var(--font-display-stack)', fontSize: 40, lineHeight: 1.1, margin: '4px 0' }}>{formatGBP(nextPayout)}</div>
        <div style={{ fontSize: 14, opacity: 0.85 }}>
          {bank?.account_number ? `To ••••${bank.account_number.slice(-4)} · ` : ''}
          {held > 0 ? `${formatGBP(held)} more held until sign-off, balance or invoice` : 'Payouts go once the customer has paid in full and your invoice is in'}
        </div>
      </div>

      <div className={ui.sectionHead}>
        <h2 className={ui.sectionTitle}>Recent jobs</h2>
        <Link href="/won" className={ui.sectionLink}>Diary</Link>
      </div>
      {(won ?? []).length === 0 ? (
        <div className={ui.card} style={{ color: 'var(--ink-2)' }}>No won jobs yet. Price the jobs that come in and they&rsquo;ll appear here.</div>
      ) : (
        <div className={ui.rows}>
          {(won ?? []).map((j) => {
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

      <div className={ui.card} style={{ marginTop: 22, background: '#fff8d6', border: '1px solid #f2e39a' }}>
        <div className={ui.cardTitle} style={{ color: '#6b5a00' }}>✦ Emmerdale Premium{premium ? ' · you’re a member' : ''}</div>
        <ul className={ui.promises} style={{ marginTop: 10 }}>
          <li className={ui.promise} style={{ background: 'transparent', padding: '4px 0' }}>
            <span className={ui.tick} aria-hidden="true">✓</span>
            <span><strong>First refusal on new jobs.</strong> Price new jobs near you before anyone else sees them.</span>
          </li>
          <li className={ui.promise} style={{ background: 'transparent', padding: '4px 0' }}>
            <span className={ui.tick} aria-hidden="true">✓</span>
            <span><strong>5% commission, not 15%.</strong> Customers see your price plus less on top.</span>
          </li>
        </ul>
        <p className={ui.note}>
          {premium ? 'Manage your membership on the website, in your account.' : 'Premium is bought on the website: sign in at emmerdaleagriculture.com/account.'}
        </p>
      </div>
    </main>
  );
}
