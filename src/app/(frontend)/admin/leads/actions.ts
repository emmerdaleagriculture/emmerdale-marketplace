'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
}

/** Dismiss a lead (spam, duplicate, out of scope). Reversible via re-pend. */
export async function dismissLeadAction(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('leads')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}

/** Put a dismissed lead back in the queue. */
export async function repenLeadAction(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('leads')
    .update({ status: 'pending' })
    .eq('id', id)
    .eq('status', 'dismissed');
  if (error) throw new Error(error.message);
  revalidatePath('/admin/leads');
}
