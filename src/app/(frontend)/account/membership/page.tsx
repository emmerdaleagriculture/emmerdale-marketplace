import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ContactUsButton } from '@/components/ContactUsButton';
import { PremiumPanel } from '../PremiumPanel';
import { membershipOf } from '@/lib/membership';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail, nonContractorPath } from '@/lib/auth';
import a from '../../auth.module.css';
import ac from '../account.module.css';

export const metadata: Metadata = {
  title: 'Your membership',
  robots: { index: false, follow: false },
};

const MEMBERSHIP_PATH = '/account/membership';

/**
 * Membership on its own page. The header's membership link used to drop a
 * contractor part-way down the dashboard, between their jobs and their
 * settings; "manage my membership" deserves a page of its own. Same panel
 * as the dashboard (join, move between tiers, Stripe billing portal), with
 * Stripe sent back here afterwards rather than to the dashboard.
 *
 * The flags the dashboard passes — pending (membership waits for approval)
 * and suspended (joining restores the account) — are worked out the same
 * way here. A suspended contractor we have not vetted, or one suspended
 * while paying, gets told to talk to us, as on the dashboard.
 */
export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>;
}) {
  const { sub: subNotice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${MEMBERSHIP_PATH}`);

  const { data: contractor } = await supabase
    .from('contractors')
    .select('id, business_name, status, vetted_at, premium_comped_until, open_comped_until')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor && isAdminEmail(user.email)) redirect('/admin');
  if (!contractor) redirect(await nonContractorPath(user.id));

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, tier, current_period_end, cancel_at_period_end')
    .eq('contractor_id', user.id)
    .maybeSingle();

  const membership = membershipOf(sub, contractor);
  const status = contractor.status;
  const canRejoin = status === 'suspended' && Boolean(contractor.vetted_at) && membership === null;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb
            tone="light"
            jsonLd={false}
            skipHome
            items={[{ label: 'Dashboard', href: '/account' }, { label: 'Membership' }]}
          />
          <div className={a.eyebrow}>{contractor.business_name}</div>
          <h1 className={a.title}>Your membership</h1>
          <div className={ac.statusRow}>
            <span
              className={`${ac.badge} ${membership ? ac.premiumBadge : ''}`}
            >
              {membership === 'open' ? '◆ Open' : membership === 'premium' ? '★ Premium' : 'Free plan'}
            </span>
            <span className={ac.email}>{user.email}</span>
          </div>

          {status === 'suspended' && !canRejoin && (
            <div className={`${ac.banner} ${ac.suspended}`}>
              <div className={ac.bannerTitle}>Account suspended</div>
              Your account is currently suspended. Please get in touch if you think this is a
              mistake.
            </div>
          )}

          {(status !== 'suspended' || canRejoin) && (
            <PremiumPanel
              sub={sub ?? null}
              compedUntil={contractor.premium_comped_until ?? null}
              openCompedUntil={contractor.open_comped_until ?? null}
              notice={subNotice}
              pending={status === 'pending'}
              suspended={canRejoin}
              returnPath={MEMBERSHIP_PATH}
            />
          )}

          <p className={ac.subBody}>
            <Link href="/account">← Back to your dashboard</Link>
          </p>

          <ContactUsButton
            subject={`Membership — ${contractor.business_name}`}
            body={`\n\n—\n${contractor.business_name} · ${user.email ?? ''}`}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
