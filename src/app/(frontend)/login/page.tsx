import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { LoginForm } from './LoginForm';
import { getUser } from '@/lib/auth';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Emmerdale Agriculture contractor account.',
  alternates: { canonical: '/login' },
  // A login form has no search value — keep it out of the index (and the sitemap).
  robots: { index: false, follow: true },
};

export default async function LoginPage() {
  if (await getUser()) redirect('/account');

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>For contractors</div>
          <h1 className={a.title}>Log in</h1>
          <p className={a.sub}>Welcome back. Log in to manage your account and claim jobs.</p>
          <LoginForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
