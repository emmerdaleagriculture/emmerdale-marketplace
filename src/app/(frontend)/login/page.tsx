import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { LoginForm } from './LoginForm';
import { SignInButtons } from '@/components/app/SignInButtons';
import { signInProvidersConfigured } from '@/lib/app/signInProviders';
import { appPlatform } from '@/lib/appMode.server';
import { getUser, postLoginPath, safeInternalPath } from '@/lib/auth';
import a from '../auth.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = {
  title: 'Log in',
  description:
    'Log in to Emmerdale Agriculture: one login for customers tracking a job and for contractors in the network.',
  alternates: { canonical: '/login' },
  // A login form has no search value — keep it out of the index (and the sitemap).
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeInternalPath(sp.next);
  const user = await getUser();
  if (user) redirect(next ?? (await postLoginPath(user.id, user.email)));

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Customers and contractors</div>
          <h1 className={a.title}>Log in</h1>
          <p className={a.sub}>
            One login for both sides. Tell us which you are and we&rsquo;ll take you
            to the right place.
          </p>
          {sp.error === 'link' && (
            <p className={f.error}>
              That link has expired or has already been used. Log in below, or ask for a new one.
            </p>
          )}
          {/* Google and Apple (PRD task 3). The same account as the password
              login: an existing address is linked, not duplicated. With no
              ?next=, the callback routes by role as the form does. */}
          {signInProvidersConfigured().length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <SignInButtons next={next ?? ''} compact dividerText="or with your password" appleFirst={(await appPlatform()) === 'ios'} />
            </div>
          )}
          <LoginForm next={next ?? undefined} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
