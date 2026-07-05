import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AccountForm } from './AccountForm';
import { createClient } from '@/lib/supabase/server';
import { getCounties, getServices } from '@/lib/reference';
import { stripeConfigured } from '@/lib/stripe';
import { formatDateTime } from '@/lib/time';
import a from '../auth.module.css';
import ac from './account.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>;
}) {
  const { sub: subMsg } = await searchParams;
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
  if (!contractor) redirect('/signup');

  const [counties, services, ccRows, subRow] = await Promise.all([
    getCounties(),
    getServices(),
    supabase.from('contractor_counties').select('county_id').eq('contractor_id', user.id),
    supabase.from('subscriptions').select('*').eq('contractor_id', user.id).maybeSingle(),
  ]);
  const selectedCounties = (ccRows.data ?? []).map((r) => r.county_id!).filter(Boolean);

  const status = contractor.status;
  const subscription = subRow.data;
  const isActive =
    !!subscription &&
    (subscription.status === 'active' ||
      (subscription.status === 'canceled' &&
        subscription.current_period_end != null &&
        new Date(subscription.current_period_end) > new Date()));

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Your account</div>
          <h1 className={a.title}>{contractor.business_name}</h1>
          <p className={ac.metaRow}>{user.email}</p>

          {subMsg === 'success' && (
            <div className={`${ac.banner} ${ac.approved}`}>
              <div className={ac.bannerTitle}>You’re now a paid member</div>
              You’ll get first access to every job in your counties. It can take a
              moment to activate — refresh if the status below hasn’t updated.
            </div>
          )}
          {subMsg === 'cancelled' && (
            <div className={`${ac.banner} ${ac.pending}`}>Checkout cancelled — no charge was made.</div>
          )}

          {status === 'pending' && (
            <div className={`${ac.banner} ${ac.pending}`}>
              <div className={ac.bannerTitle}>Application under review</div>
              We’re reviewing your application. You’ll get an email when you’re
              approved — then you’ll see jobs in your counties. You can update your
              details below in the meantime.
            </div>
          )}
          {status === 'approved' && (
            <div className={`${ac.banner} ${ac.approved}`}>
              <div className={ac.bannerTitle}>You’re approved</div>
              You’ll be emailed when a job is posted in one of your counties. See the{' '}
              <Link href="/jobs">job board</Link>.
            </div>
          )}
          {status === 'suspended' && (
            <div className={`${ac.banner} ${ac.suspended}`}>
              <div className={ac.bannerTitle}>Account suspended</div>
              Your account is currently suspended and won’t receive job
              notifications. Please get in touch if you think this is a mistake.
            </div>
          )}

          {/* Paid tier */}
          {status === 'approved' && (
            <div className={ac.subCard}>
              <div className={ac.subHead}>
                <span className={ac.subTitle}>Membership</span>
                <span className={`${ac.subPill} ${isActive ? ac.subActive : ac.subInactive}`}>
                  {isActive ? 'Paid member' : 'Free'}
                </span>
              </div>

              {isActive ? (
                <>
                  <p className={ac.subBody}>
                    You get every job in your counties <strong>12 hours early</strong>,
                    with customer contact and no bidding.
                    {subscription?.status === 'canceled' && subscription.current_period_end && (
                      <> Your membership ends {formatDateTime(subscription.current_period_end)}.</>
                    )}
                  </p>
                  <form action="/api/stripe/portal" method="post">
                    <button type="submit" className={f.btnGhost}>
                      Manage subscription
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className={ac.subBody}>
                    See every job in your counties <strong>12 hours before anyone
                    else</strong> — full details including customer contact, no
                    bidding. <strong>£20/month.</strong>
                  </p>
                  {stripeConfigured() ? (
                    <form action="/api/stripe/checkout" method="post">
                      <button type="submit" className={f.btnYellow}>
                        Upgrade — £20/month
                      </button>
                    </form>
                  ) : (
                    <p className={f.hint}>Paid membership is launching soon.</p>
                  )}
                </>
              )}
            </div>
          )}

          <AccountForm
            contractor={contractor}
            counties={counties}
            services={services}
            selectedCounties={selectedCounties}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
