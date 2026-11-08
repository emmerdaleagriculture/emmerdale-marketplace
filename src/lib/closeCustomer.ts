import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Closes a customer by email: every open job under that address withdrawn,
 * details scrubbed (sq_close_customer, 20261002140000), then the two things
 * SQL cannot do — photos out of storage, and the logins of every account
 * owning one of those jobs deleted. Admin only (the job page's Close
 * customer), where a person has checked who is asking: contact_email is
 * unverified, so this must never be reachable by the customer themselves —
 * they go through closeCustomerAccount (since 2026-11-08).
 */
export async function closeCustomer(email: string): Promise<{ jobs: number; withdrawn: number } | { error: string }> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('sq_close_customer', { p_email: email });
  const res = data as { ok: boolean; reason?: string; jobs: number; withdrawn: number; photo_paths: string[]; user_ids: string[] } | null;
  if (error || !res?.ok) {
    console.error('[sq] close customer failed:', error?.message ?? res?.reason);
    return { error: 'That didn’t work. Nothing has been changed.' };
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

/**
 * The customer's own "Close my account": the same scrub as closeCustomer, but
 * only for the jobs this account owns (sq_close_customer_account,
 * 20261108120000). Never by email — contact_email and a signup email are both
 * unverified, and closing by them let a stranger wipe someone else's jobs and
 * login. The login itself is deleted by the caller.
 */
export async function closeCustomerAccount(customerId: string): Promise<{ jobs: number; withdrawn: number } | { error: string }> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('sq_close_customer_account', { p_customer_id: customerId });
  const res = data as { ok: boolean; reason?: string; jobs: number; withdrawn: number; photo_paths: string[] } | null;
  if (error || !res?.ok) {
    console.error('[sq] close customer account failed:', error?.message ?? res?.reason);
    return { error: 'That didn’t work. Nothing has been changed.' };
  }
  if (res.photo_paths.length > 0) {
    const { error: rmErr } = await admin.storage.from('job-photos').remove(res.photo_paths);
    if (rmErr) console.error('[sq] close customer account: photos not removed:', rmErr.message);
  }
  return { jobs: res.jobs, withdrawn: res.withdrawn };
}
