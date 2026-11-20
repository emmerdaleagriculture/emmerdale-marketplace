import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ContactUsButton } from '@/components/ContactUsButton';
import { AccountForm } from '../AccountForm';
import { AvatarUpload } from './AvatarUpload';
import { avatarUrl } from '@/lib/avatars';
import { membershipOf } from '@/lib/membership';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail, nonContractorPath } from '@/lib/auth';
import { isAppRequest } from '@/lib/appMode.server';
import { getCounties, getServices } from '@/lib/reference';
import { LogoutButton, ThemeRow } from '@/components/app/PushControls';
import a from '../../auth.module.css';
import ui from '../../app/app-ui.module.css';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

/**
 * The contractor's settings: business details, services, counties,
 * notifications and (Premium) the listing and council tenders. Moved off the
 * dashboard so it opens on work; contractors still pending or suspended have
 * no dashboard, and see this form on /account as before.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/settings');

  const [{ data: contractor }, { data: sub }] = await Promise.all([
    supabase.from('contractors').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status, tier').eq('contractor_id', user.id).maybeSingle(),
  ]);
  if (!contractor && isAdminEmail(user.email)) redirect('/admin');
  if (!contractor) redirect(await nonContractorPath(user.id));

  const [counties, services, ccRows, app] = await Promise.all([
    getCounties(),
    getServices(),
    supabase.from('contractor_counties').select('county_id').eq('contractor_id', user.id),
    isAppRequest(),
  ]);
  const selectedCounties = (ccRows.data ?? []).map((r) => r.county_id!).filter(Boolean);
  const status = contractor.status;
  const isOpen = membershipOf(sub, contractor) === 'open';

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb
            tone="light"
            jsonLd={false}
            skipHome
            items={[{ label: 'Dashboard', href: '/account' }, { label: 'Settings' }]}
          />
          <div className={a.eyebrow}>{contractor.business_name}</div>
          <h1 className={a.title}>Settings</h1>

          <AvatarUpload url={avatarUrl(contractor.avatar_path)} name={contractor.business_name} />

          <div className={ui.rows} style={{ margin: '0 0 20px' }}>
            <Link href="/account/bank" className={ui.row}>
              Bank details
              <span className={ui.rowValue}>Where we pay you ›</span>
            </Link>
          </div>

          <AccountForm
            contractor={contractor}
            counties={counties}
            selectedCounties={selectedCounties}
            listing={isOpen && status === 'approved'}
            tenders={isOpen && status === 'approved' ? 'open' : app ? 'locked-app' : 'locked'}
            services={services}
          />

          {/* App only: the site header carried log-out, and it is hidden there. */}
          <div data-app-only style={{ margin: '24px 0' }}>
            <div className={ui.rows}>
              <ThemeRow />
              <Link href="/app/account/delete" className={`${ui.row} ${ui.rowDanger}`}>
                Delete my account
                <span className={ui.rowValue}>›</span>
              </Link>
            </div>
            <div style={{ marginTop: 12 }}>
              <LogoutButton className={`${ui.btn} ${ui.btnGhost}`} />
            </div>
          </div>

          <p style={{ margin: '24px 0' }}>
            <Link href="/account">← Back to your dashboard</Link>
          </p>

          <ContactUsButton
            subject={`Contractor enquiry: ${contractor.business_name}`}
            body={`\n\n${contractor.business_name} · ${user.email ?? ''}`}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
