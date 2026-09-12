import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AccountForm } from './AccountForm';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth';
import { getCounties, getServices } from '@/lib/reference';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { timeAgo, timeLeft } from '@/lib/time';
import a from '../auth.module.css';
import ac from './account.module.css';

export const metadata: Metadata = {
  title: 'Your dashboard',
  robots: { index: false, follow: false },
};

/**
 * The contractor's home — where login lands. It used to be only the settings
 * form, 13,000px of it on a phone, so the things that earn a contractor money
 * (a job closing tomorrow, a customer waiting for a call, an invoice holding
 * up a payout) were two menus away. Now it opens on those: four numbers, then
 * a "needs you now" list in the order they matter, then settings folded away.
 *
 * Everything reads through the contractor's own RLS-backed views, the same
 * ones /invitations and /won use.
 */

const DAY = 24 * 60 * 60 * 1000;
const WON_ACTIVE = new Set(['awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor']);
const WON_DONE = new Set(['completed', 'paid']);

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Under review',
  suspended: 'Suspended',
};

type Action = {
  key: string;
  href: string;
  title: string;
  detail: string;
  cta: string;
  urgent?: boolean;
};

function clip(text: string, n: number) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Infinity);

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  // Admins aren't contractors — without this, an admin with no contractor
  // profile ping-pongs between /account and /onboarding forever.
  if (!contractor && isAdminEmail(user.email)) redirect('/admin');
  // A confirmed contractor who hasn't completed onboarding has no profile yet.
  if (!contractor) redirect('/onboarding');

  const [counties, services, ccRows, invQ, wonQ, quoteQ] = await Promise.all([
    getCounties(),
    getServices(),
    supabase.from('contractor_counties').select('county_id').eq('contractor_id', user.id),
    supabase
      .from('my_sq_invitations')
      .select('id, token, status, service, postcode_district, county, distance_miles, expires_at, job_state, submission_id')
      .limit(200),
    supabase
      .from('my_sq_won_jobs')
      .select('id, service, status, contact_name, contractor_price_pence, awarded_at, contractor_invoice_at')
      .order('awarded_at', { ascending: false })
      .limit(100),
    supabase
      .from('contractor_quotes')
      .select('submission_id, quote_type, contractor_price_pence, rate_value_pence, confirmed_by_contractor')
      .eq('contractor_id', user.id)
      .is('superseded_by', null)
      .limit(500),
  ]);
  const selectedCounties = (ccRows.data ?? []).map((r) => r.county_id!).filter(Boolean);

  const now = Date.now();
  const open = (invQ.data ?? []).filter((i) => i.job_state === 'open');
  const toPrice = open
    .filter((i) => i.status === 'sent' || i.status === 'viewed')
    .sort((x, y) => when(x.expires_at) - when(y.expires_at));
  const awaiting = open
    .filter((i) => i.status === 'priced')
    .sort((x, y) => when(x.expires_at) - when(y.expires_at));

  const quoteBySub = new Map(
    (quoteQ.data ?? []).filter((q) => q.confirmed_by_contractor).map((q) => [q.submission_id, q]),
  );
  const yourPrice = (submissionId: string | null) => {
    const q = submissionId ? quoteBySub.get(submissionId) : undefined;
    if (!q) return null;
    if (q.quote_type === 'rate' && q.rate_value_pence != null) return `${formatGBP(q.rate_value_pence)} rate`;
    return q.contractor_price_pence != null ? formatGBP(q.contractor_price_pence) : null;
  };

  const won = wonQ.data ?? [];
  const wonActive = won.filter((j) => WON_ACTIVE.has(j.status ?? ''));
  const toContact = won.filter((j) => j.status === 'awarded');
  const toInvoice = won.filter((j) => WON_DONE.has(j.status ?? '') && !j.contractor_invoice_at);
  const sum = (list: typeof won) => list.reduce((n, j) => n + (j.contractor_price_pence ?? 0), 0);
  const earned = sum(won.filter((j) => WON_DONE.has(j.status ?? '')));
  const inProgress = sum(wonActive);

  const place = (i: { postcode_district: string | null; county: string | null }) =>
    [i.postcode_district, i.county].filter(Boolean).join(', ');

  // Ordered by what costs the contractor most to leave: a customer who has
  // paid a deposit and not been called, a payout held for an invoice, then
  // the jobs that close soonest.
  const actions: Action[] = [
    ...toContact.map((j) => ({
      key: `contact-${j.id}`,
      href: '/won',
      title: `Call ${j.contact_name ?? 'your customer'}`,
      detail: `${clip(j.service ?? 'Job', 50)} · won ${j.awarded_at ? timeAgo(j.awarded_at) : 'recently'} — they’re expecting to hear from you within 24 hours`,
      cta: 'Details',
      urgent: true,
    })),
    ...toInvoice.map((j) => ({
      key: `invoice-${j.id}`,
      href: '/won',
      title: 'Send your invoice',
      detail: `${clip(j.service ?? 'Job', 50)}${j.contractor_price_pence != null ? ` · ${formatGBP(j.contractor_price_pence)}` : ''} — your payout is released once it’s in`,
      cta: 'Upload',
    })),
    ...toPrice.slice(0, 5).map((i) => ({
      key: `price-${i.id}`,
      href: `/quote/${i.token}`,
      title: clip(i.service ?? 'Job', 60),
      detail: [
        place(i),
        i.distance_miles != null ? `${i.distance_miles} miles` : null,
        i.expires_at ? timeLeft(i.expires_at) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      cta: 'Price it',
      urgent: when(i.expires_at) - now < DAY,
    })),
  ];

  const tiles = [
    {
      label: 'To price',
      value: toPrice.length,
      hint: toPrice[0]?.expires_at ? `Next: ${timeLeft(toPrice[0].expires_at)}` : 'Nothing waiting',
      href: '/invitations',
    },
    {
      label: 'Customer deciding',
      value: awaiting.length,
      hint: quoteBySub.size ? `${quoteBySub.size} priced in total` : 'No prices sent yet',
      href: '/invitations',
    },
    {
      label: 'Won jobs on the go',
      value: wonActive.length,
      hint: toContact.length ? `${toContact.length} to call` : `${won.length} won in total`,
      href: '/won',
    },
    {
      label: 'Earned',
      value: formatGBP(earned),
      hint: inProgress ? `${formatGBP(inProgress)} in progress` : 'From completed jobs',
      href: '/won',
    },
  ];

  const status = contractor.status;
  const serviceCount = (contractor.services ?? []).length;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Your dashboard</div>
          <h1 className={a.title}>{contractor.business_name}</h1>
          <div className={ac.statusRow}>
            <span className={`${ac.badge} ${ac[status] ?? ''}`}>{STATUS_LABELS[status] ?? status}</span>
            {(contractor.rating_count ?? 0) > 0 && contractor.rating_avg != null && (
              <span>
                ★ {Number(contractor.rating_avg).toFixed(1)} · {contractor.rating_count} rating
                {contractor.rating_count === 1 ? '' : 's'}
              </span>
            )}
            <span className={ac.email}>{user.email}</span>
          </div>

          {status === 'pending' && (
            <div className={`${ac.banner} ${ac.pending}`}>
              <div className={ac.bannerTitle}>Application under review</div>
              We’re reviewing your application. You’ll get an email when you’re
              approved — then jobs in your counties will appear here. You can update
              your details below in the meantime.
            </div>
          )}
          {status === 'suspended' && (
            <div className={`${ac.banner} ${ac.suspended}`}>
              <div className={ac.bannerTitle}>Account suspended</div>
              Your account is currently suspended and won’t receive job
              notifications. Please get in touch if you think this is a mistake.
            </div>
          )}

          {status === 'approved' && (
            <>
              <div className={ac.tiles}>
                {tiles.map((t) => (
                  <Link key={t.label} href={t.href} prefetch={false} className={ac.tile}>
                    <span className={ac.tileValue}>{t.value}</span>
                    <span className={ac.tileLabel}>{t.label}</span>
                    <span className={ac.tileHint}>{t.hint}</span>
                  </Link>
                ))}
              </div>

              <h2 className={a.groupTitle}>Needs you now</h2>
              {actions.length === 0 ? (
                <div className={ac.caughtUp}>
                  You’re all caught up. We’ll email you the moment a job comes in for
                  your counties.
                </div>
              ) : (
                <ul className={ac.actions}>
                  {actions.map((x) => (
                    <li key={x.key}>
                      <Link
                        href={x.href}
                        prefetch={false}
                        className={`${ac.action} ${x.urgent ? ac.actionUrgent : ''}`}
                      >
                        <span className={ac.actionText}>
                          <span className={ac.actionTitle}>{x.title}</span>
                          <span className={ac.actionDetail}>{x.detail}</span>
                        </span>
                        <span className={ac.actionCta}>{x.cta} →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {toPrice.length > 5 && (
                <Link href="/invitations" className={ac.more}>
                  See all {toPrice.length} jobs to price →
                </Link>
              )}

              {awaiting.length > 0 && (
                <>
                  <h2 className={a.groupTitle}>Priced — waiting on the customer</h2>
                  <ul className={ac.actions}>
                    {awaiting.map((i) => (
                      <li key={i.id}>
                        <Link href={`/quote/${i.token}`} prefetch={false} className={ac.action}>
                          <span className={ac.actionText}>
                            <span className={ac.actionTitle}>{clip(i.service ?? 'Job', 60)}</span>
                            <span className={ac.actionDetail}>
                              {[
                                place(i),
                                yourPrice(i.submission_id) ? `Your price ${yourPrice(i.submission_id)}` : null,
                                i.expires_at ? timeLeft(i.expires_at) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                          <span className={ac.actionCta}>View →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className={ac.quickLinks}>
                <Link href="/invitations">All invitations &amp; history</Link>
                <Link href="/won">Won jobs</Link>
              </div>
            </>
          )}

          <h2 id="settings" className={a.groupTitle}>Your settings</h2>
          <p className={ac.coverage}>
            You cover <b>{selectedCounties.length}</b> {selectedCounties.length === 1 ? 'county' : 'counties'} and{' '}
            <b>{serviceCount}</b> {serviceCount === 1 ? 'service' : 'services'}. Keep these
            accurate and you’ll only hear about work you want.
          </p>
          <AccountForm
            contractor={contractor}
            counties={counties}
            selectedCounties={selectedCounties}
            services={services}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
