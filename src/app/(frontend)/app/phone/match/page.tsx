import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser, safeInternalPath } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getVerification, maskEmail } from '@/lib/app/phone';
import { MatchForm } from './MatchForm';
import ui from '../../app-ui.module.css';

export const metadata: Metadata = { title: 'Is this you?', robots: { index: false, follow: false } };

/**
 * Shown once, straight after a phone is verified, when that number is
 * already verified on another account (the Apple "Hide My Email" case,
 * PRD task 3). The person decides; nothing is merged without them.
 */
export default async function PhoneMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/app');
  const v = await getVerification(user.id);
  if (!v?.match_user_id) redirect('/app/continue');

  const admin = createServiceRoleClient();
  const [{ data: other }, contractor] = await Promise.all([
    admin.auth.admin.getUserById(v.match_user_id),
    admin.from('contractors').select('id').eq('id', v.match_user_id).maybeSingle(),
  ]);
  if (!other.user?.email) redirect('/app/continue');

  return (
    <main className={ui.screen}>
      <MatchForm
        emailMasked={maskEmail(other.user.email)}
        kind={contractor.data ? 'contractor' : 'customer'}
        next={safeInternalPath(sp.next)}
        role={sp.role === 'contractor' || sp.role === 'customer' ? sp.role : null}
      />
    </main>
  );
}
