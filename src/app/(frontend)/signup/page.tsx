import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SignupForm } from './SignupForm';
import { getUser, safeInternalPath } from '@/lib/auth';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Join the network',
  description:
    'Sign up as a contractor — get matched to paddock and land jobs by county and deal with the customer directly, no commission.',
  alternates: { canonical: '/signup' },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeInternalPath((await searchParams).next);
  // Already signed in: a customer arriving from a job link goes back to it,
  // a contractor goes to their account as before.
  if (await getUser()) redirect(next ?? '/account');

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
          <SignupForm next={next ?? undefined} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
