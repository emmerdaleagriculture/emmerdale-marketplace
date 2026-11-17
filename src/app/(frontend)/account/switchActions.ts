'use server';

import { revalidatePath } from 'next/cache';
import { revalidateDirectory } from '@/lib/directory';
import { canSwitchMembership } from '@/lib/membershipSwitch';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

/** Far enough off to read as "for good"; matches the comps set by hand. */
const FOREVER = '2099-12-31T23:59:59Z';

/**
 * Sets the signed-in account's own tier by comp (see membershipSwitch.ts).
 * Open is premium plus contact details, so it holds both comps; Premium
 * drops the Open one; none clears both.
 */
export async function switchMembershipAction(formData: FormData): Promise<void> {
  const tier = String(formData.get('tier') ?? '');
  if (tier !== 'none' && tier !== 'premium' && tier !== 'open') return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !canSwitchMembership(user.email)) return;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('contractors')
    .update({
      premium_comped_until: tier === 'none' ? null : FOREVER,
      open_comped_until: tier === 'open' ? FOREVER : null,
    })
    .eq('id', user.id);
  if (error) throw new Error(error.message);
  // As an admin comp does: catch up on jobs already in a members-first window.
  if (tier !== 'none') await admin.rpc('invite_contractor_to_open_jobs', { p_contractor_id: user.id });

  revalidateDirectory();
  revalidatePath('/account', 'layout');
}
