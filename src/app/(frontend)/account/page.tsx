import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AccountForm } from './AccountForm';
import { createClient } from '@/lib/supabase/server';
import { getCounties, getServices } from '@/lib/reference';
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

  // Authed but no profile — send them to finish signing up.
  if (!contractor) redirect('/signup');

  const [counties, services, ccRows] = await Promise.all([
    getCounties(),
    getServices(),
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
              You’ll be emailed when a job is posted in one of your counties. The
              job board (<Link href="/jobs">/jobs</Link>) opens soon.
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
            services={services}
            selectedCounties={selectedCounties}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
