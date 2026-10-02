import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Closes a customer: every open job withdrawn, their details scrubbed from
 * all of them (sq_close_customer, 20261002140000), then the two things SQL
 * cannot do — their photos out of storage, and their login gone. Used by
 * the customer's own "Close my account" and by the admin job page.
 */
export async function closeCustomer(email: string): Promise<{ jobs: number; withdrawn: number } | { error: string }> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('sq_close_customer', { p_email: email });
  const res = data as { ok: boolean; reason?: string; jobs: number; withdrawn: number; photo_paths: string[]; user_ids: string[] } | null;
  if (error || !res?.ok) {
    console.error('[sq] close customer failed:', error?.message ?? res?.reason);
    return { error: 'That didn’t work — nothing has been changed.' };
  }
  if (res.photo_paths.length > 0) {
    const { error: rmErr } = await admin.storage.from('job-photos').remove(res.photo_paths);
    if (rmErr) console.error('[sq] close customer: photos not removed:', rmErr.message);
  }
  for (const id of res.user_ids) {
    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr) console.error('[sq] close customer: auth user not deleted:', authErr.message);
  }
  return { jobs: res.jobs, withdrawn: res.withdrawn };
}
