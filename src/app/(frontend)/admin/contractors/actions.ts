'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error('Not authorised');
  }
}

/**
 * Approve / suspend / re-pend a contractor (spec §7.1 approval queue). Uses the
 * service role (bypasses RLS) after re-checking the caller is an admin. When a
 * contractor is newly approved, queue the "application approved" email
 * (spec §8) into pending_emails for the Edge Function to send.
 */
export async function setContractorStatus(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !['pending', 'approved', 'suspended'].includes(status)) {
    throw new Error('Invalid request');
  }

  const admin = createServiceRoleClient();

  const { data: before } = await admin
    .from('contractors')
    .select('status, email, business_name')
    .eq('id', id)
    .maybeSingle();

  const { error } = await admin.from('contractors').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);

  if (status === 'approved' && before && before.status !== 'approved') {
    await admin.from('pending_emails').insert({
      kind: 'application_approved',
      to_email: before.email,
      payload: { contractor_id: id, business_name: before.business_name },
    });
  }

  revalidatePath('/admin/contractors');
  revalidatePath(`/admin/contractors/${id}`);
}
