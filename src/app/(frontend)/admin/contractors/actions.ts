'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error('Not authorised');
  }
}

/**
 * Approve a contractor (spec §7.1 approval queue). Uses the service role
 * (bypasses RLS) after re-checking the caller is an admin. On approval, queue
 * the "application approved" email (spec §8) into pending_emails.
 */
export async function setContractorStatus(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !['pending', 'approved'].includes(status)) {
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

/**
 * Permanently remove a contractor — used both to reject a pending application
 * and to delete an existing contractor. Deletes the underlying auth user, which
 * cascades (contractors.id references auth.users on delete cascade) to the
 * contractor row and their county coverage; any jobs they claimed have
 * claimed_by set null. Falls back to deleting just the contractor row if the
 * auth user can't be removed.
 */
export async function deleteContractor(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.error('[admin] auth user delete failed, removing contractor row only:', authErr.message);
    const { error: rowErr } = await admin.from('contractors').delete().eq('id', id);
    if (rowErr) throw new Error(rowErr.message);
  }

  revalidatePath('/admin/contractors');
  redirect('/admin/contractors');
}
