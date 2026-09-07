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
 * Approve, suspend or reinstate a contractor (spec §7.1 approval queue). Uses
 * the service role (bypasses RLS) after re-checking the caller is an admin.
 * Approving a pending application queues the "application approved" email
 * (spec §8); reinstating a suspended contractor does not, since they have had
 * it. Every distribution path filters on status = 'approved', so suspension
 * stops the emails and the job list without touching their history.
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

  if (status === 'approved' && before?.status === 'pending') {
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
 * contractor row, their county coverage, notifications and any sealed-quote
 * invitations; their job-open history stays in contact_reveals with
 * contractor_id set null.
 *
 * Quotes, ratings and awarded jobs do not cascade: they carry customer prices
 * and payments, and the database refuses to drop them. A contractor with any
 * of those is suspended rather than deleted, and the admin is sent back to
 * the contractor page with that explanation instead of a masked server error.
 */
export async function deleteContractor(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Invalid request');

  const admin = createServiceRoleClient();

  const head = { count: 'exact', head: true } as const;
  const history = await Promise.all([
    admin.from('contractor_quotes').select('id', head).eq('contractor_id', id),
    admin.from('client_quotes').select('id', head).eq('contractor_id', id),
    admin.from('contractor_ratings').select('id', head).eq('contractor_id', id),
    admin.from('job_submissions').select('id', head).eq('awarded_contractor_id', id),
  ]).then((rs) => rs.map((r) => r.count ?? 0));
  if (history.some((n) => n > 0)) {
    redirect(`/admin/contractors/${id}?blocked=history`);
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.error('[admin] auth user delete failed, removing contractor row only:', authErr.message);
    const { error: rowErr } = await admin.from('contractors').delete().eq('id', id);
    if (rowErr) throw new Error(rowErr.message);
  }

  revalidatePath('/admin/contractors');
  redirect('/admin/contractors');
}
