import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CONTACT_EMAIL } from '@/lib/site';
import { LogoutButton, PushToggleRow } from '@/components/app/PushControls';
import { listSites } from '@/lib/customers/sites';
import ui from '../app-ui.module.css';

export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PROVIDER_LABEL: Record<string, string> = {
  apple: 'Signed in with Apple',
  google: 'Signed in with Google',
  email: 'Signed in with email',
};

/**
 * The customer's Account tab. Their name and number, the way to their
 * details and jobs, help, the legal pages, and sign out. Later tasks add
 * notifications (7) and account deletion (10) here. Contractors keep
 * /account, their dashboard, as the Earnings tab.
 */
export default async function AppAccountPage() {
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');

  const admin = createServiceRoleClient();
  const [customer, contractor] = await Promise.all([
    admin.from('customers').select('contact_name, phone, phone_verified_at').eq('id', user.id).maybeSingle(),
    admin.from('contractors').select('id').eq('id', user.id).maybeSingle(),
  ]);
  if (!customer.data) redirect(contractor.data ? '/account' : '/app');

  const sites = await listSites(user.id);
  const name = customer.data.contact_name?.trim() || null;
  const initial = (name ?? user.email ?? '?').slice(0, 1).toUpperCase();
  const provider = (user.app_metadata?.provider as string | undefined) ?? 'email';

  return (
    <main className={ui.screen}>
      <h1 className={ui.title}>Account</h1>

      <div className={ui.card}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className={ui.avatar} aria-hidden="true" style={{ width: 56, height: 56, fontSize: 24 }}>
            {initial}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className={ui.cardTitle}>{name ?? user.email}</div>
            {!customer.data.phone && (
              <div className={ui.cardSub}>
                <Link href="/app/phone?next=/app/account" className={ui.sectionLink}>
                  Add a mobile number
                </Link>
              </div>
            )}
            {customer.data.phone && (
              <div className={ui.cardSub}>
                {customer.data.phone}
                {customer.data.phone_verified_at ? (
                  <span className={ui.chip} style={{ marginTop: 0, marginLeft: 8 }}>
                    ✓ Verified
                  </span>
                ) : (
                  <Link href="/app/phone?next=/app/account" className={ui.sectionLink} style={{ marginLeft: 8 }}>
                    Verify
                  </Link>
                )}
              </div>
            )}
            <div className={ui.cardSub}>{PROVIDER_LABEL[provider] ?? `Signed in with ${provider}`}</div>
          </div>
        </div>
      </div>

      <div className={ui.kicker}>Your land</div>
      <div className={ui.rows}>
        {sites.map((site) => (
          <div key={site.id} className={ui.row}>
            <span className={ui.rowIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12Z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </span>
            {site.label}
            <span className={ui.rowValue}>
              {[site.postcode.split(' ')[0], site.acres != null ? `${site.acres} acres` : null].filter(Boolean).join(' · ')}
            </span>
          </div>
        ))}
        <Link href="/app/location?next=/app/account" className={ui.row}>
          <span className={ui.rowIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          {sites.length ? 'Add another field or paddock' : 'Add your field or paddock'}
        </Link>
      </div>

      <div className={ui.kicker}>Your jobs</div>
      <div className={ui.rows}>
        <Link href="/my" className={ui.row}>
          Every job and its prices
          <span className={ui.rowValue}>›</span>
        </Link>
        <Link href="/my#details" className={ui.row}>
          Your name and number
          <span className={ui.rowValue}>›</span>
        </Link>
      </div>

      <div className={ui.kicker}>Settings</div>
      <div className={ui.rows}>
        <PushToggleRow />
        <Link href="/my#details" className={ui.row}>
          Text updates
          <span className={ui.rowValue}>Per job ›</span>
        </Link>
      </div>

      <div className={ui.kicker}>Help</div>
      <div className={ui.rows}>
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Help with the app')}`} className={ui.row}>
          Help and support
          <span className={ui.rowValue}>{CONTACT_EMAIL}</span>
        </a>
        <Link href="/customer-terms" className={ui.row}>
          Customer terms
          <span className={ui.rowValue}>›</span>
        </Link>
        <Link href="/service-charter" className={ui.row}>
          Service charter
          <span className={ui.rowValue}>›</span>
        </Link>
        <Link href="/privacy" className={ui.row}>
          Privacy policy
          <span className={ui.rowValue}>›</span>
        </Link>
        {contractor.data && (
          <Link href="/account" className={ui.row}>
            Your contractor dashboard
            <span className={ui.rowValue}>›</span>
          </Link>
        )}
      </div>

      <div className={ui.kicker}>Your data</div>
      <div className={ui.rows}>
        <Link href="/app/account/delete" className={`${ui.row} ${ui.rowDanger}`}>
          Delete my account
          <span className={ui.rowValue}>›</span>
        </Link>
      </div>

      <div style={{ marginTop: 24 }}>
        <LogoutButton className={`${ui.btn} ${ui.btnGhost}`} />
      </div>
      <p className={ui.note} style={{ textAlign: 'center' }}>
        {user.email}
      </p>
    </main>
  );
}
