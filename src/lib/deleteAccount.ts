import type { User } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { closeCustomer } from '@/lib/closeCustomer';
import { revokeAppleTokens } from '@/lib/apple/tokens';
import { getStripe, stripeConfigured } from '@/lib/stripe';

/**
 * "Delete my account", done by the person themselves (PRD task 10).
 *
 * What goes: the login (Apple's token revoked where we hold one), the
 * person's name, number and email, their devices, open jobs (withdrawn),
 * their place on the network. What stays: the records of priced, booked and
 * paid jobs, because tax and accounting law keeps those for six years — a
 * contractor with such history keeps a scrubbed tombstone row
 * (contractors.id no longer cascades from auth.users, migration
 * 20261018170000); one without is removed outright. Customers go through
 * closeCustomer, which already withdraws and scrubs.
 */
export async function contractorHasHistory(contractorId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const head = { count: 'exact', head: true } as const;
  const counts = await Promise.all([
    admin.from('contractor_quotes').select('id', head).eq('contractor_id', contractorId),
    admin.from('client_quotes').select('id', head).eq('contractor_id', contractorId),
    admin.from('contractor_ratings').select('id', head).eq('contractor_id', contractorId),
    admin.from('contractor_payouts').select('id', head).eq('contractor_id', contractorId),
    admin.from('job_submissions').select('id', head).eq('awarded_contractor_id', contractorId),
  ]);
  return counts.some((r) => (r.count ?? 0) > 0);
}

async function cancelPremium(contractorId: string): Promise<void> {
  if (!stripeConfigured()) return;
  const admin = createServiceRoleClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('contractor_id', contractorId)
    .maybeSingle();
  if (!sub?.stripe_subscription_id || sub.status === 'canceled') return;
  try {
    await getStripe().subscriptions.cancel(sub.stripe_subscription_id);
  } catch (err) {
    console.error('[delete] premium subscription not cancelled:', err);
  }
}

async function closeContractor(contractorId: string): Promise<'removed' | 'scrubbed'> {
  const admin = createServiceRoleClient();
  await cancelPremium(contractorId);

  if (!(await contractorHasHistory(contractorId))) {
    const { error } = await admin.from('contractors').delete().eq('id', contractorId);
    if (error) throw new Error(`contractor row: ${error.message}`);
    return 'removed';
  }

  // Keep the row for the records it anchors; take the person out of it.
  const { error } = await admin
    .from('contractors')
    .update({
      contact_name: 'Removed',
      phone: '',
      email: `removed+${contractorId}@deleted.invalid`,
      status: 'suspended',
      notify_new_jobs: false,
      notify_sms: false,
      phone_verified_at: null,
    })
    .eq('id', contractorId);
  if (error) throw new Error(`contractor scrub: ${error.message}`);
  await Promise.all([
    admin.from('contractor_counties').delete().eq('contractor_id', contractorId),
    admin.from('client_quotes').update({ status: 'closed' }).eq('contractor_id', contractorId).eq('status', 'active'),
  ]);
  return 'scrubbed';
}

export async function deleteOwnAccount(user: User): Promise<{ ok: true } | { error: string }> {
  const admin = createServiceRoleClient();
  try {
    // Apple first: once the login is gone there is no user to revoke for.
    const apple = await revokeAppleTokens(user.id);
    if (!apple.revoked) console.error('[delete] Apple token not revoked for', user.id);

    await admin.from('device_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).is('revoked_at', null);

    const { data: contractor } = await admin.from('contractors').select('id').eq('id', user.id).maybeSingle();
    if (contractor) await closeContractor(user.id);

    // The customer side withdraws open jobs, scrubs their details from every
    // job and deletes the login. Someone with no customer side still needs
    // the login gone.
    const { data: customer } = await admin.from('customers').select('id').eq('id', user.id).maybeSingle();
    if (customer && user.email) {
      const res = await closeCustomer(user.email);
      if ('error' in res) return res;
    }
    // closeCustomer deletes the logins it finds on the jobs; a customer with
    // no job yet, or a contractor, still has theirs. Gone already is fine.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error && !/not found/i.test(error.message)) throw new Error(`auth user: ${error.message}`);
    return { ok: true };
  } catch (err) {
    console.error('[delete] account deletion failed:', err);
    return { error: 'That didn’t go through — nothing has been changed that you can’t still use. Please try again or contact us.' };
  }
}
