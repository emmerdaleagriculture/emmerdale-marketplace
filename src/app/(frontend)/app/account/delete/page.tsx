import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { contractorHasHistory } from '@/lib/deleteAccount';
import { DeleteForm } from './DeleteForm';
import ui from '../../app-ui.module.css';

export const metadata: Metadata = { title: 'Delete my account', robots: { index: false, follow: false } };

/**
 * Delete my account (PRD task 10). Says exactly what goes and what the law
 * makes us keep, then one tick and one button. Reachable from both Account
 * screens in the app; admins are sent back — an admin login is removed by
 * another admin, not from a phone.
 */
export default async function DeleteAccountPage() {
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');

  const admin = createServiceRoleClient();
  const [contractor, customer, jobs] = await Promise.all([
    admin.from('contractors').select('id').eq('id', user.id).maybeSingle(),
    admin.from('customers').select('id').eq('id', user.id).maybeSingle(),
    admin.from('job_submissions').select('id', { count: 'exact', head: true }).eq('customer_id', user.id).in('status', ['awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor', 'completed', 'paid']),
  ]);
  const side = contractor.data && customer.data ? 'both' : contractor.data ? 'contractor' : 'customer';
  const keeps = (contractor.data ? await contractorHasHistory(user.id) : false) || (jobs.count ?? 0) > 0;

  return (
    <main className={ui.screen}>
      <h1 className={ui.title}>Delete your account?</h1>
      <DeleteForm side={side} keeps={keeps} />
    </main>
  );
}
