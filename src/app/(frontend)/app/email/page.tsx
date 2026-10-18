import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { appLandingPath, roleIntent } from '@/lib/app/landing';
import { EmailCodeForm } from './EmailCodeForm';
import ui from '../app-ui.module.css';

export const metadata: Metadata = { title: 'Continue with email', robots: { index: false, follow: false } };

/**
 * "Continue with email" (PRD task 4): a code, not a password. App only by
 * intent — the website's login keeps its passwords — but the page works
 * anywhere, which is also how it is tested.
 */
export default async function AppEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const sp = await searchParams;
  const intent = roleIntent(sp.role);
  const user = await getUser();
  if (user) redirect(await appLandingPath(user.id, user.email, intent));

  return (
    <main className={ui.screen}>
      <EmailCodeForm role={intent} />
    </main>
  );
}
