import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AccountForm } from './AccountForm';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth';
import { getCounties } from '@/lib/reference';
import a from '../auth.module.css';
import ac from './account.module.css';

export const metadata: Metadata = { title: 'Your account' };

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

  const [counties, ccRows] = await Promise.all([
    getCounties(),
    supabase.from('contractor_counties').select('county_id').eq('contractor_id', user.id),
  ]);
  const selectedCounties = (ccRows.data ?? []).map((r) => r.county_id!).filter(Boolean);

  const status = contractor.status;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Your account</div>
          <h1 className={a.title}>{contractor.business_name}</h1>
          <p className={ac.metaRow}>{user.email}</p>

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

          <AccountForm
            contractor={contractor}
            counties={counties}
            selectedCounties={selectedCounties}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
