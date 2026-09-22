'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return user;
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
 * Submitted values echoed back on error, so a rejection does not wipe the
 * operator's edits — the same shape and the same reason as JobFormState in
 * admin/jobs/new, which this replaces.
 */
export type PublishLeadValues = {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  details: string;
  service_id?: number;
  county_id?: number;
  consent: boolean;
};
export type PublishLeadState = FormState & { values?: PublishLeadValues };

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
  _prev: PublishLeadState,
  formData: FormData,
): Promise<PublishLeadState> {
  const user = await assertAdmin();
  const leadId = String(formData.get('lead_id') ?? '');
  const serviceId = Number(formData.get('service_id'));
  const countyId = Number(formData.get('county_id'));
  const name = String(formData.get('customer_name') ?? '').trim();
  const phone = String(formData.get('customer_phone') ?? '').trim();
  const email = String(formData.get('customer_email') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim();

  // Every rejection hands the operator's own edits back. React resets a form
  // once its action resolves, so without this a missed consent tick throws
  // away a rewritten description and re-seeds the box from the raw lead —
  // which is the one thing they came here to fix.
  const values: PublishLeadValues = {
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    details,
    service_id: Number.isInteger(serviceId) && serviceId > 0 ? serviceId : undefined,
    county_id: Number.isInteger(countyId) && countyId > 0 ? countyId : undefined,
    consent: formData.get('consent') === 'on',
  };
  const refuse = (error: string): PublishLeadState => ({ error, values });

  if (!leadId) return refuse('Missing the lead.');
  if (!Number.isInteger(serviceId) || serviceId <= 0) return refuse('Pick the service first.');
  if (!Number.isInteger(countyId) || countyId <= 0) return refuse('Pick the county first.');
  if (!name) return refuse('The customer needs a name.');
  if (!phone && !email) return refuse('A phone number or an email is needed.');
  if (!details) return refuse('Say what the job is.');
  // The customer never saw a consent form on a Facebook ad, so the operator
  // confirms it the way they always have — the constraint this replaces.
  if (!values.consent) {
    return refuse('Confirm the customer agreed to their details being passed on.');
  }

  const admin = createServiceRoleClient();
  const now = new Date();

  // Claim the lead BEFORE creating anything. The old path guarded its leads
  // update with .eq('status','pending'); without that, a second submit — a
  // stale tab, a double click, or a failed link that left the lead pending —
  // publishes the job twice and invites the same contractors twice over.
  const { data: claimed, error: claimError } = await admin
    .from('leads')
    .update({ status: 'converted' })
    .eq('id', leadId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimError) {
    console.error('[leads] claim failed:', claimError);
    return refuse('Could not take that lead — try again.');
  }
  if (!claimed) return refuse('That lead has already been published or dismissed.');
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
    // Put the lead back so it is not stranded as converted with nothing to
    // show for it.
    await admin.from('leads').update({ status: 'pending' }).eq('id', leadId);
    return refuse(`Could not publish it: ${error?.message ?? 'unknown error'}`);
  }

  const { error: linkError } = await admin
    .from('leads')
    .update({ submission_id: sub.id })
    .eq('id', leadId);
  if (linkError) console.error('[leads] link failed:', linkError);

  // Consent is confirmed by a person and has to leave a trace. The legacy
  // jobs row had consent_to_share / consent_at / consent_wording_version
  // columns; job_submissions has none, and the checkbox says "logged now",
  // so it is logged here — in the event log the rest of the job's history
  // lives in, with the operator who ticked it and the wording they saw.
  const { error: logError } = await admin.rpc('log_job_event', {
    p_job_id: sub.id,
    p_event_type: 'consent_recorded',
    p_from: null,
    p_to: null,
    p_actor_type: 'operator',
    p_actor_id: user.id,
    p_reason: 'Operator confirmed the customer agreed to their details being passed to contractors',
    p_metadata: { lead_id: leadId, wording_version: 'v2-multi', source: 'admin_lead_publish' },
  });
  if (logError) console.error('[leads] consent log failed:', logError);

  const { error: distError } = await admin.rpc('distribute_submission', {
    p_submission_id: sub.id,
  });
  if (distError) console.error('[leads] distribute_submission failed:', distError);

  revalidatePath('/admin/leads');
  revalidatePath('/admin/ops');
  redirect(`/admin/submissions/${sub.id}`);
}
