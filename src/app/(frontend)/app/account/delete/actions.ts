'use server';

import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deleteOwnAccount } from '@/lib/deleteAccount';
import type { FormState } from '@/lib/form';

/** The signed-in person deletes their own account (PRD task 10). */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get('confirm') !== 'on') return { error: 'Tick the box to confirm.' };
  const user = await getUser();
  if (!user) redirect('/app');
  // An admin login is removed by another admin, never from a phone.
  if (isAdminEmail(user.email)) return { error: 'Admin accounts can’t be deleted from the app.' };
  const res = await deleteOwnAccount(user);
  if ('error' in res) return res;
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => {});
  redirect('/app?account=deleted');
}
