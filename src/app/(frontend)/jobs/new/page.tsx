import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PostJobForm } from './PostJobForm';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth';
import { getCounties, getServices } from '@/lib/reference';
import a from '../../auth.module.css';
import j from '../jobs.module.css';

export const metadata: Metadata = {
  title: 'Post a job',
  robots: { index: false, follow: false },
};

export default async function PostJobPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/jobs/new');

  // Admins have the full intake form with its extra controls — use that.
  if (isAdminEmail(user.email)) redirect('/admin/jobs/new');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('status, contact_name, phone, email')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) redirect('/onboarding');

  const [services, counties] = await Promise.all([getServices(), getCounties()]);

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>The network</div>
          <h1 className={a.title}>Post a job</h1>

          {contractor.status === 'suspended' ? (
            <div className={j.gate}>
              Your account is suspended, so you can’t post jobs. Get in touch if
              you think this is a mistake.
            </div>
          ) : (
            <>
              <p className={a.sub}>
                Got work you can’t take on — or a job of your own that needs
                doing? Post it here. We review every job before it goes out, then
                contractors covering the county are notified and get in touch
                directly with the contact you name.
              </p>
              <PostJobForm
                services={services}
                counties={counties}
                defaults={{
                  contact_name: contractor.contact_name,
                  contact_phone: contractor.phone,
                  contact_email: contractor.email,
                }}
              />
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
