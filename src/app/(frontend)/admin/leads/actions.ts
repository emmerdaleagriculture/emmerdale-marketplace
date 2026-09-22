'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';

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
  // Return to the queue so the dismissal is visibly reflected — the detail page
  // otherwise re-renders unchanged and the click looks like it did nothing.
  redirect('/admin/leads');
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

/**
 * Publish a lead into the sealed-quote flow.
 *
 * Replaces the old path, which posted into the legacy `jobs` board — the last
 * thing still writing there, and the reason lead work never appeared on
 * /admin/ops. Portal enquiries already publish themselves this way
 * (autoConvertEnquiry); this is the same destination for the ones a human
 * still reviews, chiefly Facebook lead-ads, where 12 of 13 have been junk.
 *
 * One service, not several: job_submissions.service_id is singular, and
 * distribution matches contractors on it. The legacy board took an array
 * because it matched on county alone and never used the services for routing.
 *
 * No postcode on the submission, for the reason set out in
 * components/enquiry/actions.ts: a customer's postcode is not always the job's
 * location, and county is what distribution actually matches on.
 */
export async function publishLeadAsSubmissionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertAdmin();
  const leadId = String(formData.get('lead_id') ?? '');
  const serviceId = Number(formData.get('service_id'));
  const countyId = Number(formData.get('county_id'));
  const name = String(formData.get('customer_name') ?? '').trim();
  const phone = String(formData.get('customer_phone') ?? '').trim();
  const email = String(formData.get('customer_email') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim();

  if (!leadId) return { error: 'Missing the lead.' };
  if (!Number.isInteger(serviceId) || serviceId <= 0) return { error: 'Pick the service first.' };
  if (!Number.isInteger(countyId) || countyId <= 0) return { error: 'Pick the county first.' };
  if (!name) return { error: 'The customer needs a name.' };
  if (!phone && !email) return { error: 'A phone number or an email is needed.' };
  if (!details) return { error: 'Say what the job is.' };
  // The customer never saw a consent form on a Facebook ad, so the operator
  // confirms it the way they always have — the constraint this replaces.
  if (formData.get('consent') !== 'on') {
    return { error: 'Confirm the customer agreed to their details being passed on.' };
  }

  const admin = createServiceRoleClient();
  const now = new Date();
  const { data: sub, error } = await admin
    .from('job_submissions')
    .insert({
      status: 'confirmed',
      confirmed_at: now.toISOString(),
      raw_text: details,
      service_verbatim: details,
      service_id: serviceId,
      service_confirmed: true,
      county_id: countyId,
      postcode: null,
      contact_name: name,
      contact_phone: phone || null,
      contact_email: email || null,
      contact_preference: 'either',
      expires_at: new Date(now.getTime() + 10 * 86400_000).toISOString(),
    })
    .select('id')
    .single();
  if (error || !sub) {
    console.error('[leads] publish failed:', error);
    return { error: `Could not publish it: ${error?.message ?? 'unknown error'}` };
  }

  const { error: linkError } = await admin
    .from('leads')
    .update({ status: 'converted', submission_id: sub.id })
    .eq('id', leadId);
  if (linkError) console.error('[leads] link failed:', linkError);

  const { error: distError } = await admin.rpc('distribute_submission', {
    p_submission_id: sub.id,
  });
  if (distError) console.error('[leads] distribute_submission failed:', distError);

  revalidatePath('/admin/leads');
  revalidatePath('/admin/ops');
  redirect(`/admin/submissions/${sub.id}`);
}
