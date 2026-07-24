'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import { resolveCounty } from '@/lib/postcodes';
import type { FormState } from '@/lib/form';

/**
 * Submitted values echoed back on error. React 19 resets uncontrolled fields
 * once a form action completes, so without these the whole form wipes on a
 * validation/lookup failure — the form re-seeds its defaultValues from here.
 */
export type JobFormValues = {
  customer_name: string;
  customer_first_name: string;
  customer_phone: string;
  customer_email: string;
  title: string;
  description: string;
  service_ids: number[];
  postcode: string;
  budget_hint: string;
  county_override: string;
  exclusive_hours: string;
  consent: boolean;
};

export type JobFormState = FormState & { values?: JobFormValues };

const JobSchema = z.object({
  customer_name: z.string().trim().min(1, 'Customer name is required.'),
  customer_first_name: z.string().trim().optional().or(z.literal('')),
  customer_phone: z.string().trim().min(5, 'Customer phone is required.'),
  customer_email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  title: z.string().trim().min(1, 'Job title is required.'),
  description: z.string().trim().min(1, 'Description is required.'),
  service_ids: z.array(z.coerce.number().int()).default([]),
  postcode: z.string().trim().min(3, 'Postcode is required.'),
  budget_hint: z.string().trim().optional().or(z.literal('')),
  county_override: z.coerce.number().int().optional().or(z.literal('')),
  // Paid-tier head-start window in hours. Defaults to 0 (open to everyone now)
  // while the paid tier is shelved — with no subscribers, a head start would
  // just hide the job from the whole network for that window.
  exclusive_hours: z.coerce.number().int().min(0).max(72).default(0),
});

export async function createJobAction(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) return { error: 'Not authorised.' };

  const values: JobFormValues = {
    customer_name: String(formData.get('customer_name') ?? ''),
    customer_first_name: String(formData.get('customer_first_name') ?? ''),
    customer_phone: String(formData.get('customer_phone') ?? ''),
    customer_email: String(formData.get('customer_email') ?? ''),
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    service_ids: formData.getAll('service_ids').map(Number).filter(Number.isFinite),
    postcode: String(formData.get('postcode') ?? ''),
    budget_hint: String(formData.get('budget_hint') ?? ''),
    county_override: String(formData.get('county_override') ?? ''),
    exclusive_hours: String(formData.get('exclusive_hours') ?? '12'),
    consent: formData.get('consent') === 'on',
  };

  // Consent is a blocking gate (spec §6): no consent → the job cannot be posted.
  if (formData.get('consent') !== 'on') {
    return { error: 'You must confirm the customer has consented to share their details.', values };
  }

  const parsed = JobSchema.safeParse({
    customer_name: formData.get('customer_name'),
    customer_first_name: formData.get('customer_first_name'),
    customer_phone: formData.get('customer_phone'),
    customer_email: formData.get('customer_email'),
    title: formData.get('title'),
    description: formData.get('description'),
    service_ids: formData.getAll('service_ids'),
    postcode: formData.get('postcode'),
    budget_hint: formData.get('budget_hint'),
    county_override: formData.get('county_override') || '',
    exclusive_hours: formData.get('exclusive_hours') ?? 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.', values };
  }
  const d = parsed.data;

  const admin = createServiceRoleClient();
  const leadId = String(formData.get('lead_id') || '');

  // Resolve the county (postcodes.io → district map). Manual override wins.
  const r = await resolveCounty(d.postcode);
  const override = typeof d.county_override === 'number' ? d.county_override : undefined;
  let countyId = override ?? r.county_id;
  const outcode = r.outcode;

  // Publishing a lead must not be blocked by a live-lookup blip: the county
  // was already resolved and stored on the lead at enquiry time — reuse it.
  if (!countyId && leadId) {
    const { data: lead } = await admin.from('leads').select('details').eq('id', leadId).maybeSingle();
    const stored = (lead?.details as { county_id?: number | null } | null)?.county_id;
    if (stored) countyId = stored;
  }

  if (!countyId) {
    return { error: r.error ?? 'Could not resolve a county — pick one manually below.', values };
  }
  if (!outcode) {
    return { error: 'That postcode looks invalid. Check it and try again.', values };
  }

  const now = new Date();
  // Paid head-start window: the job opens to everyone after `exclusive_hours`.
  // 0h → opens immediately (skips the exclusive state). Once open, the job
  // stays on the board until a contractor claims it.
  const opensAt = new Date(now.getTime() + d.exclusive_hours * 3600 * 1000);
  const isExclusive = d.exclusive_hours > 0;

  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      title: d.title,
      description: d.description,
      service_ids: d.service_ids,
      postcode: d.postcode.toUpperCase(),
      postcode_district: outcode,
      town: r.town ?? null,
      county_id: countyId,
      customer_name: d.customer_name,
      // Public first name — defaults to the first token of the full name;
      // the surname never appears on the listing.
      customer_first_name: d.customer_first_name || d.customer_name.split(/\s+/)[0],
      customer_phone: d.customer_phone,
      customer_email: d.customer_email || null,
      consent_to_share: true,
      consent_at: now.toISOString(),
      consent_wording_version: 'v2-multi',
      budget_hint: d.budget_hint || null,
      status: isExclusive ? 'exclusive' : 'open',
      bidding_opens_at: opensAt.toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !job) {
    return { error: `Could not create the job: ${error?.message ?? 'unknown error'}`, values };
  }

  // Notify: exclusive → paid members now; open → free tier now. When an
  // exclusive job later flips to open, the cron's open_due_jobs notifies the
  // free tier then.
  if (isExclusive) {
    await admin.rpc('notify_paid_members', { p_job_id: job.id });
  } else {
    await admin.rpc('notify_job_open', { p_job_id: job.id });
  }

  // Published from a lead? Mark it converted and link the job.
  if (leadId) {
    await admin
      .from('leads')
      .update({ status: 'converted', job_id: job.id })
      .eq('id', leadId)
      .eq('status', 'pending');
  }

  redirect(`/admin/jobs/${job.id}`);
}
