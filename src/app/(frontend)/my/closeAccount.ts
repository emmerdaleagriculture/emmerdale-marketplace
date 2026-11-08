'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { deleteOwnAccount } from '@/lib/deleteAccount';
import type { FormState } from '@/lib/form';

/**
 * The signed-in customer closes their own account. The same path as the app's
 * Delete account (deleteOwnAccount): Apple token revoked first, any contractor
 * side closed, the jobs this account owns withdrawn and scrubbed, devices
 * revoked, then the login. Not by email — until 2026-11-08 this was
 * closeCustomer(user.email), and signup autoconfirms, so signing up as a
 * stranger's address and pressing Close wiped their jobs.
 */
export async function closeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get('confirm') ?? '').trim().toLowerCase() !== 'close') return { error: 'Type "close" to confirm.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You need to be signed in.' };

  const res = await deleteOwnAccount(user);
  if ('error' in res) return res;
  await supabase.auth.signOut();
  redirect('/?account=closed');
}
