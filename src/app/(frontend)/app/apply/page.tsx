import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getServices } from '@/lib/reference';
import { ApplyFlow } from './ApplyFlow';

export const metadata: Metadata = { title: 'Apply to join', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The contractor application in the app (PRD task 9): business and
 * services, travel radius on a map (or nationwide for the services picked),
 * then the checks — insurance certificate, certificates, bank details, the
 * Code of Conduct — and "we're checking your details". The website's
 * /onboarding sends app visitors here.
 */
export default async function AppApplyPage() {
  const user = await getUser();
  if (!user) redirect('/app?role=contractor');
  if (isAdminEmail(user.email)) redirect('/admin');
  const { data: existing } = await createServiceRoleClient().from('contractors').select('status').eq('id', user.id).maybeSingle();
  if (existing) redirect(existing.status === 'pending' ? '/app/apply/done' : '/invitations');
  const services = await getServices();
  const name = (user.user_metadata?.full_name as string | undefined) ?? '';
  return <ApplyFlow services={services} contactName={name} />;
}
