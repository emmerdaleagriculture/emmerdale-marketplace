import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { pickLanding, roleIntent } from '@/lib/app/landing';
import { RoleForm } from './RoleForm';
import { nameFromUser } from '@/lib/app/userName';
import ui from '../app-ui.module.css';
import s from './role.module.css';

export const metadata: Metadata = { title: 'How will you use the app?', robots: { index: false, follow: false } };

/**
 * First screen after a first sign-in (PRD task 5): customer or contractor.
 * Anyone who already has a profile row has answered and is sent on.
 */
export default async function AppRolePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');

  const admin = createServiceRoleClient();
  const [contractor, customer] = await Promise.all([
    admin.from('contractors').select('id').eq('id', user.id).maybeSingle(),
    admin.from('customers').select('id').eq('id', user.id).maybeSingle(),
  ]);
  if (contractor.data || customer.data) {
    redirect(pickLanding({ contractor: !!contractor.data, customer: !!customer.data }, null));
  }

  const first = nameFromUser(user.user_metadata)?.split(/\s+/)[0] ?? null;

  return (
    <main className={ui.screen}>
      <div className={s.progress}>
        <span />
      </div>
      <h1 className={ui.title}>
        {first ? `Welcome, ${first}. ` : 'Welcome. '}How will you use the app?
      </h1>
      <p className={s.lede}>You can add the other later from your account.</p>
      <RoleForm initial={roleIntent(sp.role)} />
    </main>
  );
}
