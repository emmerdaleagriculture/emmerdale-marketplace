import type { User } from '@supabase/supabase-js';
import { revalidateDirectory } from '@/lib/directory';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { closeCustomer } from '@/lib/closeCustomer';
import { revokeAppleTokens } from '@/lib/apple/tokens';
import { getStripe, refundUnapprovedPremium, stripeConfigured } from '@/lib/stripe';

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

async function cancelPremium(contractorId: string, pending: boolean): Promise<void> {
  if (!stripeConfigured()) return;
  const admin = createServiceRoleClient();
  // Never approved: the money goes back, as the admin reject path does.
  if (pending) {
    try {
      await refundUnapprovedPremium(contractorId);
    } catch (err) {
      console.error('[delete] unapproved premium not refunded:', err);
    }
    return;
  }
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

async function closeContractor(contractorId: string, status: string): Promise<'removed' | 'scrubbed'> {
  const admin = createServiceRoleClient();
  await cancelPremium(contractorId, status === 'pending');

  // The person's documents and bank account go whichever path follows.
  const { data: docs } = await admin.from('contractors').select('insurance_path, certificate_paths').eq('id', contractorId).maybeSingle();
  const paths = [docs?.insurance_path, ...(docs?.certificate_paths ?? [])].filter((p): p is string => !!p);
  if (paths.length) {
    const { error } = await admin.storage.from('contractor-documents').remove(paths);
    if (error) console.error('[delete] documents not removed:', error.message);
  }
  await admin.from('contractor_bank_details').delete().eq('contractor_id', contractorId);

  if (!(await contractorHasHistory(contractorId))) {
    const { error } = await admin.from('contractors').delete().eq('id', contractorId);
    if (error) throw new Error(`contractor row: ${error.message}`);
    revalidateDirectory();
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
      insurance_path: null,
      certificate_paths: [],
      // The base is a home address for a sole trader; the records don't need it.
      base_postcode: '',
      base_lat: null,
      base_lng: null,
    })
    .eq('id', contractorId);
  if (error) throw new Error(`contractor scrub: ${error.message}`);
  await Promise.all([
    admin.from('contractor_counties').delete().eq('contractor_id', contractorId),
    admin.from('client_quotes').update({ status: 'closed' }).eq('contractor_id', contractorId).eq('status', 'active'),
  ]);
  // Suspended and without counties: out of the coverage counts and the directory.
  revalidateDirectory();
  return 'scrubbed';
}

export async function deleteOwnAccount(user: User): Promise<{ ok: true } | { error: string }> {
  const admin = createServiceRoleClient();
  try {
    // Apple first, and a refusal stops everything: once the login is gone
    // the token cascades away and can never be revoked.
    const apple = await revokeAppleTokens(user.id);
    if (!apple.revoked) {
      console.error('[delete] Apple token not revoked for', user.id);
      return { error: 'We couldn’t disconnect your Apple sign-in just now, so nothing has been deleted. Please try again in a few minutes.' };
    }

    const { data: contractor } = await admin.from('contractors').select('id, status').eq('id', user.id).maybeSingle();
    if (contractor) await closeContractor(user.id, contractor.status);

    // The customer side withdraws open jobs, scrubs their details from every
    // job and deletes the login — by email, so every address they used on
    // a job is covered, not only the login's.
    const { data: customer } = await admin.from('customers').select('id').eq('id', user.id).maybeSingle();
    if (customer) {
      const { data: jobs } = await admin.from('job_submissions').select('contact_email').eq('customer_id', user.id);
      const emails = new Set<string>();
      if (user.email) emails.add(user.email.toLowerCase());
      for (const j of jobs ?? []) if (j.contact_email) emails.add(j.contact_email.toLowerCase());
      for (const email of emails) {
        const res = await closeCustomer(email);
        if ('error' in res) return res;
      }
    }

    await admin.from('device_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).is('revoked_at', null);
    // closeCustomer deletes the logins it finds on the jobs; a customer with
    // no job yet, or a contractor, still has theirs. Gone already is fine.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error && !/not found/i.test(error.message)) throw new Error(`auth user: ${error.message}`);
    return { ok: true };
  } catch (err) {
    console.error('[delete] account deletion failed:', err);
    return { error: 'That didn’t go through. Your login still works; please try again or contact us and we’ll finish it by hand.' };
  }
}
