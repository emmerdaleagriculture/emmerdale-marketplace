import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { OnboardingForm } from './OnboardingForm';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth';
import { getCounties, getServices } from '@/lib/reference';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Complete your profile',
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Onboarding is a one-time step: if the profile already exists, they're done.
  // Admins have no contractor profile and never onboard.
  const { data: contractor } = await supabase
    .from('contractors')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (contractor) redirect('/account');
  if (isAdminEmail(user.email)) redirect('/admin');

  const [counties, services] = await Promise.all([getCounties(), getServices()]);

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Step 2 of 2</div>
          <h1 className={a.title}>Tell us about your business</h1>
          <p className={a.sub}>
            This is the last step. We’ll review your application and email you
            when you’re approved — then you’ll see jobs in your counties and can
            bid to win the work. You can change any of this later in your account.
          </p>
          <OnboardingForm counties={counties} services={services} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
