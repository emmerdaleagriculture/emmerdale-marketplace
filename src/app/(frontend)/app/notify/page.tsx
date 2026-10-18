import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, safeInternalPath } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NotifyScreen } from './NotifyScreen';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false, follow: false } };

/**
 * The notifications explainer, once, at the end of onboarding (PRD task 7).
 * /app/continue sends people here the first time on a device; "Turn on"
 * calls the system prompt, "Not now" goes to the tabs. Either way the
 * device remembers it was asked (cookie), and Account has the switch.
 */
export default async function AppNotifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/app');
  const next = safeInternalPath(sp.next) ?? '/app/continue';
  const { data: contractor } = await createServiceRoleClient()
    .from('contractors').select('id').eq('id', user.id).maybeSingle();
  return <NotifyScreen next={next} side={contractor ? 'contractor' : 'customer'} />;
}
