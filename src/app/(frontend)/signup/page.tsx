import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SignupForm } from './SignupForm';
import { getUser } from '@/lib/auth';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Join the network',
  description:
    'Sign up as a contractor — get matched to paddock and land jobs by county and claim the work, first come, first served.',
  alternates: { canonical: '/signup' },
};

export default async function SignupPage() {
  if (await getUser()) redirect('/account');

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>For contractors</div>
          <h1 className={a.title}>
            Join the network — <em>free.</em>
          </h1>
          <p className={a.sub}>
            Create your account to get started. Next, we’ll ask about your
            business and the counties you cover — then we review your application
            and email you when you’re approved.
          </p>
          <SignupForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
