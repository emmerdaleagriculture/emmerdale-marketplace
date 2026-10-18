import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail, safeInternalPath } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { roleIntent } from '@/lib/app/landing';
import { PhoneForm } from './PhoneForm';
import ui from '../app-ui.module.css';

export const metadata: Metadata = { title: 'Your mobile number', robots: { index: false, follow: false } };

/**
 * The compulsory phone step (PRD task 5). Everyone signed in to the app
 * without a verified number is sent here by the middleware
 * (lib/supabase/middleware.ts), with ?next= the page they were going to.
 * Admins are not gated.
 */
export default async function AppPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');

  const next = safeInternalPath(sp.next);
  const intent = roleIntent(sp.role);

  // Which copy: a contractor's number is for customers who have booked them;
  // a customer's is for the contractor they book.
  const admin = createServiceRoleClient();
  const { data: contractor } = await admin.from('contractors').select('id').eq('id', user.id).maybeSingle();
  const side = contractor || intent === 'contractor' || next?.startsWith('/onboarding') || next?.startsWith('/app/apply') ? 'contractor' : 'customer';

  return (
    <main className={ui.screen}>
      <PhoneForm side={side} next={next} role={intent} />
    </main>
  );
}
