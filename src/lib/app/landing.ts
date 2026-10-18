import { isAdminEmail } from '@/lib/adminEmails';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Where a signed-in person lands in the app.
 *
 * The website's postLoginPath sends customers to /my and contractors to
 * /account; the app opens each on its first tab instead, and someone with
 * no profile row yet has not said which they are, so they go to the role
 * screen. "Intent" is the choice made on the welcome screen before signing
 * in ("Run a contracting business? Apply to join"), carried through the
 * sign-in as ?role=contractor so the role screen can preselect it.
 */
export type RoleIntent = 'contractor' | 'customer' | null;

export function roleIntent(raw: string | null | undefined): RoleIntent {
  return raw === 'contractor' || raw === 'customer' ? raw : null;
}

export function pickLanding(
  rows: { contractor: boolean; customer: boolean },
  intent: RoleIntent,
): string {
  if (rows.contractor) return '/invitations';
  if (rows.customer) return '/app/home';
  return intent ? `/app/role?role=${intent}` : '/app/role';
}

export async function appLandingPath(
  userId: string,
  email: string | null | undefined,
  intent: RoleIntent = null,
): Promise<string> {
  if (isAdminEmail(email)) return '/admin';
  try {
    const admin = createServiceRoleClient();
    const [contractor, customer] = await Promise.all([
      admin.from('contractors').select('id').eq('id', userId).maybeSingle(),
      admin.from('customers').select('id').eq('id', userId).maybeSingle(),
    ]);
    return pickLanding({ contractor: !!contractor.data, customer: !!customer.data }, intent);
  } catch (err) {
    console.error('[app] landing lookup failed:', err);
    return '/app/role';
  }
}
