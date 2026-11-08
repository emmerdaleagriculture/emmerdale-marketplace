'use server';

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { closeCustomerAccount } from '@/lib/closeCustomer';
import type { FormState } from '@/lib/form';

/**
 * The signed-in customer closes their own account: the jobs this account owns
 * are withdrawn and scrubbed, then the login goes. Not by email — until
 * 2026-11-08 this was closeCustomer(user.email), and signup autoconfirms, so
 * signing up as a stranger's address and pressing Close wiped their jobs.
 */
export async function closeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get('confirm') ?? '').trim().toLowerCase() !== 'close') return { error: 'Type "close" to confirm.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You need to be signed in.' };

  const res = await closeCustomerAccount(user.id);
  if ('error' in res) return res;
  const { error } = await createServiceRoleClient().auth.admin.deleteUser(user.id);
  if (error && !/not found/i.test(error.message)) console.error('[my] close account: login not deleted:', error.message);
  await supabase.auth.signOut();
  redirect('/?account=closed');
}
