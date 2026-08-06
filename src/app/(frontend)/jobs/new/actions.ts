'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, getContractor } from '@/lib/auth';
import { notifyAdmins } from '@/lib/adminNotify';
import { resolveCounty } from '@/lib/postcodes';
import type { FormState } from '@/lib/form';

/**
 * Submitted values echoed back on error — React 19 resets uncontrolled fields
 * once a form action completes, so the form re-seeds its defaultValues from
 * here rather than wiping on a validation/lookup failure.
 */
export type PostJobValues = {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  title: string;
  description: string;
  service_ids: number[];
  postcode: string;
  budget_hint: string;
  county_override: string;
  consent: boolean;
};

export type PostJobState = FormState & { values?: PostJobValues };

const PostJobSchema = z.object({
  contact_name: z.string().trim().min(1, 'A contact name is required.'),
  contact_phone: z.string().trim().min(5, 'A contact phone number is required.'),
  contact_email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  title: z.string().trim().min(1, 'A job title is required.'),
  description: z.string().trim().min(1, 'A description is required.'),
  service_ids: z.array(z.coerce.number().int()).default([]),
  postcode: z.string().trim().optional().or(z.literal('')),
  budget_hint: z.string().trim().optional().or(z.literal('')),
  county_override: z.coerce.number().int().optional().or(z.literal('')),
});

export async function submitJobAction(_prev: PostJobState, formData: FormData): Promise<PostJobState> {
  const user = await getUser();
  if (!user) return { error: 'You need to be signed in to post a job.' };
  // Same gates as the page: a profile is required, suspended accounts can't post.
  const contractor = await getContractor();
  if (!contractor) return { error: 'Complete your profile before posting a job.' };
  if (contractor.status === 'suspended') {
    return { error: 'Your account is suspended, so you can’t post jobs right now.' };
  }

  const values: PostJobValues = {
    contact_name: String(formData.get('contact_name') ?? ''),
    contact_phone: String(formData.get('contact_phone') ?? ''),
    contact_email: String(formData.get('contact_email') ?? ''),
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    service_ids: formData.getAll('service_ids').map(Number).filter(Number.isFinite),
    postcode: String(formData.get('postcode') ?? ''),
    budget_hint: String(formData.get('budget_hint') ?? ''),
    county_override: String(formData.get('county_override') ?? ''),
    consent: formData.get('consent') === 'on',
  };

  // Consent is a blocking gate (spec §6): no consent → the job cannot be posted.
  if (!values.consent) {
    return {
      error: 'You must confirm the contact has agreed to their details being shared.',
      values,
    };
  }

  const parsed = PostJobSchema.safeParse({
    contact_name: formData.get('contact_name'),
    contact_phone: formData.get('contact_phone'),
    contact_email: formData.get('contact_email'),
    title: formData.get('title'),
    description: formData.get('description'),
    service_ids: formData.getAll('service_ids'),
    postcode: formData.get('postcode'),
    budget_hint: formData.get('budget_hint'),
    county_override: formData.get('county_override') || '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.', values };
  }
  const d = parsed.data;

  // Location: a postcode auto-detects the county; a manually picked county wins
  // and makes the postcode optional. The empty select value coerces to 0, so a
  // positive check is what distinguishes "Auto-detect" from a real pick.
  const postcode = d.postcode?.trim() ?? '';
  const override =
    typeof d.county_override === 'number' && d.county_override > 0 ? d.county_override : undefined;
  const r = postcode ? await resolveCounty(postcode) : null;
  const countyId = override ?? r?.county_id;
  const outcode = r?.outcode ?? null;
  const town = r?.town ?? null;

  if (!countyId) {
    return {
      error: r?.error ?? 'Enter a postcode or pick a county — one of the two is needed.',
      values,
    };
  }
  if (postcode && !outcode) {
    return { error: 'That postcode looks invalid. Check it, or clear it and pick a county.', values };
  }

  const now = new Date();
  const admin = createServiceRoleClient();
  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      title: d.title,
      description: d.description,
      service_ids: d.service_ids,
      postcode: postcode ? postcode.toUpperCase() : null,
      postcode_district: outcode,
      town,
      county_id: countyId,
      customer_name: d.contact_name,
      // Public first name — the first token of the contact name; the surname
      // never appears on the listing.
      customer_first_name: d.contact_name.split(/\s+/)[0],
      customer_phone: d.contact_phone,
      customer_email: d.contact_email || null,
      consent_to_share: true,
      consent_at: now.toISOString(),
      consent_wording_version: 'v3-member',
      budget_hint: d.budget_hint || null,
      // Pending until admin approves — invisible to the network until then.
      status: 'pending',
      bidding_opens_at: now.toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !job) {
    return { error: 'Something went wrong saving your job — please try again.', values };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `Job awaiting review: ${d.title}`,
    `A member has posted a job — it won’t reach the network until you approve it.\n\n` +
      `Posted by: ${contractor.business_name} (${contractor.contact_name})\n` +
      `Title:     ${d.title}\n` +
      `Contact:   ${d.contact_name} · ${d.contact_phone}\n` +
      `Postcode:  ${postcode || '—'}\n` +
      `County:    ${override ? '(picked manually)' : (r?.county_name ?? '—')}\n\n` +
      `Review it: ${siteUrl}/admin/jobs/${job.id}`,
  );

  return {
    ok: true,
    message:
      'Thanks — your job has been submitted. We review every job before it goes out to the network, usually within a working day.',
  };
}
