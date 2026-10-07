'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import { refundUnapprovedPremium } from '@/lib/stripe';
import { WARNING_SUBJECT } from '@/lib/sealedQuotes/contractorWarning';

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
 *
 * Approval also vets (contractors_stamp_vetted) and invites them to every job
 * still open in their counties (contractors_invite_on_eligible), in the same
 * update — see 20260912170000_invite_new_contractors_to_open_jobs.sql.
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

  // Suspending an application that was never approved is turning it down:
  // anything paid for premium at sign-up goes back first. (A no-op for
  // everyone else, including approved members.)
  if (status === 'suspended') await refundUnapprovedPremium(id);

  const { error } = await admin.from('contractors').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);

  // Their live prices come off customers' lists too: suspension also refuses
  // acceptance (20261005200000), and a price that can't be taken shouldn't show.
  if (status === 'suspended') {
    const { error: cqErr } = await admin
      .from('client_quotes')
      .update({ status: 'closed' })
      .eq('contractor_id', id)
      .eq('status', 'active');
    if (cqErr) console.error('[admin] suspend: live prices not closed:', cqErr.message);
  }

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

  // Rejecting someone who paid for premium at sign-up: refund before the
  // delete, which cascades away the subscription row that records the payment.
  // If Stripe refuses, this throws and nothing is deleted.
  await refundUnapprovedPremium(id);

  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.error('[admin] auth user delete failed, removing contractor row only:', authErr.message);
    const { error: rowErr } = await admin.from('contractors').delete().eq('id', id);
    if (rowErr) throw new Error(rowErr.message);
  }

  revalidatePath('/admin/contractors');
  redirect('/admin/contractors');
}

/**
 * Give a contractor premium without a subscription (comp), or take it back.
 * `months` 0 removes it. Granting catches them up on jobs already in a
 * premium window, as a paid sign-up does (syncSubscription).
 */
export async function setPremiumComp(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get('id') || '');
  const months = Number(formData.get('months') || 0);
  if (!id || !Number.isFinite(months) || months < 0 || months > 36) return;

  const until = months > 0 ? new Date(Date.now() + months * 30.44 * 24 * 60 * 60 * 1000).toISOString() : null;
  const admin = createServiceRoleClient();
  const { error } = await admin.from('contractors').update({ premium_comped_until: until }).eq('id', id);
  if (error) throw new Error(error.message);
  if (until) await admin.rpc('invite_contractor_to_open_jobs', { p_contractor_id: id });

  revalidatePath(`/admin/contractors/${id}`);
}

/**
 * Warn a contractor that trying to take work off the platform again means
 * removal. Queued as an admin_direct email in the admin's own words (the
 * page pre-fills a draft); warning_contractor_id in the payload is what the
 * contractor page lists past warnings by, and submission_id the job it was
 * about.
 */
export async function sendContractorWarning(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get('id') || '');
  const text = String(formData.get('text') || '').replace(/\r\n?/g, '\n').trim();
  const submissionId = String(formData.get('submission_id') || '') || null;
  if (!id || text.length < 20) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { data: c } = await admin.from('contractors').select('email').eq('id', id).maybeSingle();
  if (!c?.email) throw new Error('No email address for this contractor');

  const { error } = await admin.from('pending_emails').insert({
    kind: 'admin_direct',
    to_email: c.email,
    payload: { subject: WARNING_SUBJECT, text, warning_contractor_id: id, submission_id: submissionId },
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/contractors/${id}`);
  redirect(`/admin/contractors/${id}?warned=1#warning`);
}
