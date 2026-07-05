import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SignupForm } from './SignupForm';
import { getCounties } from '@/lib/reference';
import { getUser } from '@/lib/auth';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Join the network',
  description:
    'Sign up as a contractor — get matched to paddock and land jobs by county and bid to win the work.',
  alternates: { canonical: '/signup' },
};

export default async function SignupPage() {
  if (await getUser()) redirect('/account');

  const counties = await getCounties();

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>For contractors</div>
          <h1 className={a.title}>
            Join the network — <em>free.</em>
          </h1>
          <p className={a.sub}>
            Tell us where you work and what you do. We’ll review your application
            and email you when you’re approved — then you’ll see jobs in your
            counties and can bid to win the work.
          </p>
          <SignupForm counties={counties} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
