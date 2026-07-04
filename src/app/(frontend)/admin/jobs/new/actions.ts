'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import { resolveCounty } from '@/lib/postcodes';
import type { FormState } from '@/lib/form';

const JobSchema = z.object({
  customer_name: z.string().trim().min(1, 'Customer name is required.'),
  customer_phone: z.string().trim().min(5, 'Customer phone is required.'),
  customer_email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  title: z.string().trim().min(1, 'Job title is required.'),
  description: z.string().trim().min(1, 'Description is required.'),
  service_ids: z.array(z.coerce.number().int()).default([]),
  postcode: z.string().trim().min(3, 'Postcode is required.'),
  budget_hint: z.string().trim().optional().or(z.literal('')),
  county_override: z.coerce.number().int().optional().or(z.literal('')),
  closes_at: z.string().trim().optional().or(z.literal('')),
});

export async function createJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) return { error: 'Not authorised.' };

  // Consent is a blocking gate (spec §6): no consent → the job cannot be posted.
  if (formData.get('consent') !== 'on') {
    return { error: 'You must confirm the customer has consented to share their details.' };
  }

  const parsed = JobSchema.safeParse({
    customer_name: formData.get('customer_name'),
    customer_phone: formData.get('customer_phone'),
    customer_email: formData.get('customer_email'),
    title: formData.get('title'),
    description: formData.get('description'),
    service_ids: formData.getAll('service_ids'),
    postcode: formData.get('postcode'),
    budget_hint: formData.get('budget_hint'),
    county_override: formData.get('county_override') || '',
    closes_at: formData.get('closes_at'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  // Resolve the county (postcodes.io → district map). Manual override wins.
  const r = await resolveCounty(d.postcode);
  const override = typeof d.county_override === 'number' ? d.county_override : undefined;
  const countyId = override ?? r.county_id;
  const outcode = r.outcode;

  if (!countyId) {
    return { error: r.error ?? 'Could not resolve a county — pick one manually below.' };
  }
  if (!outcode) {
    return { error: 'That postcode looks invalid. Check it and try again.' };
  }

  const now = new Date();
  const closesAt = d.closes_at
    ? new Date(d.closes_at)
    : new Date(now.getTime() + 24 * 3600 * 1000);
  if (isNaN(closesAt.getTime()) || closesAt <= now) {
    return { error: 'Bidding close time must be in the future.' };
  }

  const admin = createServiceRoleClient();
  // Pre-Phase-4: create directly as 'open' with bidding_opens_at = now()
  // (acceptance #15 — skip the exclusive state entirely).
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
      customer_phone: d.customer_phone,
      customer_email: d.customer_email || null,
      consent_to_share: true,
      consent_at: now.toISOString(),
      consent_wording_version: 'v2-multi',
      budget_hint: d.budget_hint || null,
      status: 'open',
      bidding_opens_at: now.toISOString(),
      bidding_closes_at: closesAt.toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !job) {
    return { error: `Could not create the job: ${error?.message ?? 'unknown error'}` };
  }

  // Queue free-tier notifications for matching contractors (idempotent).
  await admin.rpc('notify_job_open', { p_job_id: job.id });

  redirect(`/admin/jobs/${job.id}`);
}
