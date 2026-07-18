'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { resolveCounty } from '@/lib/postcodes';
import type { FormState } from '@/lib/form';

/** New-vertical enquiry categories → the label used in admin notifications. */
const CATEGORIES: Record<string, string> = {
  hay: 'hay & straw',
  'tractor-hire': 'tractor hire',
};

const EnquirySchema = z.object({
  category: z.string().refine((c) => c in CATEGORIES, 'Unknown enquiry type.'),
  name: z.string().trim().min(1, 'Your name is required.'),
  phone: z.string().trim().min(5, 'A phone number is required.'),
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  postcode: z.string().trim().min(3, 'A postcode is required.'),
  details: z.string().trim().min(1, 'Tell us a little about what you need.'),
});

const SUCCESS_MESSAGE = 'Thanks — we’ve got your enquiry and will be in touch shortly.';

/**
 * Capture a customer enquiry for a new marketplace vertical (hay, tractor hire)
 * as a lead in the admin queue, and email the admins. Same bot traps as signup
 * (honeypot + minimum fill time) — kept invisible so it doesn't cost conversions.
 */
export async function submitEnquiryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (honeypot || (renderedAt > 0 && Date.now() - renderedAt < 3000)) {
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  const parsed = EnquirySchema.safeParse({
    category: formData.get('category'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    postcode: formData.get('postcode'),
    details: formData.get('details'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;
  const label = CATEGORIES[d.category];

  // Resolve the county from the postcode now, so the admin sees the location and
  // coverage on the lead and publishing to the contractor network is one click.
  // Never blocks the enquiry — an unresolvable postcode just stores no county.
  const geo = await resolveCounty(d.postcode);

  const admin = createServiceRoleClient();
  const { error } = await admin.from('leads').insert({
    source: d.category,
    full_name: d.name,
    phone: d.phone,
    email: d.email || null,
    postcode: d.postcode,
    job_hint: d.details,
    details: {
      category: d.category,
      name: d.name,
      phone: d.phone,
      email: d.email || null,
      postcode: d.postcode,
      details: d.details,
      county_id: geo.county_id ?? null,
      county: geo.county_name ?? null,
      town: geo.town ?? null,
    },
  });
  if (error) {
    return { error: 'Something went wrong saving your enquiry — please try again or call us.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `New ${label} enquiry: ${d.name}`,
    `A customer has submitted a ${label} enquiry via the website.\n\n` +
      `Name:      ${d.name}\n` +
      `Phone:     ${d.phone}\n` +
      `Email:     ${d.email || '—'}\n` +
      `Postcode:  ${d.postcode}\n` +
      `County:    ${geo.county_name ?? '(not resolved — check the postcode)'}\n` +
      `Wants:     ${d.details}\n\n` +
      `Review in the leads queue: ${siteUrl}/admin/leads`,
  );

  return { ok: true, message: SUCCESS_MESSAGE };
}
