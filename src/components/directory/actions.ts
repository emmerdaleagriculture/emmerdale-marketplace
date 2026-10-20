'use server';

import { z } from 'zod';
import { emailDeliveryError } from '@/lib/email/deliverable';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { resolveCounty } from '@/lib/postcodes';
import type { FormState } from '@/lib/form';

const DirectEnquirySchema = z.object({
  contractor_id: z.string().uuid(),
  /** The county page it came from; absent on the directory's "everywhere" view. */
  county: z.string().trim().max(80).optional(),
  name: z.string().trim().min(1, 'Your name is required.'),
  phone: z.string().trim().min(5, 'A phone number is required.'),
  email: z.string().trim().email('An email address is required.'),
  postcode: z.string().trim().min(3, 'A postcode is required.'),
  details: z.string().trim().min(1, 'Say what you need doing.').max(800),
});

const SUCCESS = 'Sent. They have your details and will be in touch directly.';

/**
 * A customer's enquiry to one Open member from their county-page listing.
 * It goes to that contractor alone: a lead (source 'directory') with the
 * contractor on it, and an email to them with the customer's address as
 * reply-to. Nothing is distributed and nothing is priced through us —
 * the point of the listing is that the two of them talk. The same bot
 * traps as the vertical enquiry form.
 */
export async function submitDirectoryEnquiryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // The form always carries its render time; a post without one did not
  // come from the form.
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (honeypot || !(renderedAt > 0) || Date.now() - renderedAt < 3000) {
    return { ok: true, message: SUCCESS };
  }

  const parsed = DirectEnquirySchema.safeParse({
    contractor_id: formData.get('contractor_id'),
    county: formData.get('county') || undefined,
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
  const emailError = await emailDeliveryError(d.email, 'Their reply goes to this address');
  if (emailError) return { error: emailError };

  const admin = createServiceRoleClient();
  // Only a listed Open member can be written to through a listing, and
  // from a county page only for that county: the view is the one definition
  // of who is listed where, so a stale page or a forged id goes nowhere.
  let listed = admin
    .from('county_directory')
    .select('contractor_id, business_name, email')
    .eq('contractor_id', d.contractor_id);
  if (d.county) listed = listed.eq('county', d.county);
  const { data: contractor } = await listed.limit(1).maybeSingle();
  if (!contractor?.email || !contractor.business_name) {
    return {
      error:
        'This contractor is no longer taking direct enquiries. Describe the job at ' +
        `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.emmerdaleagriculture.com').replace(/^https?:\/\//, '')}/start ` +
        'and we’ll put it to the contractors covering your county.',
    };
  }

  // One a customer sends twice, or a script sends a hundred times, reaches
  // the contractor once: the same address to the same contractor within an
  // hour is answered as sent and not sent again.
  const { data: recent } = await admin
    .from('leads')
    .select('id')
    .eq('source', 'directory')
    .eq('contractor_id', d.contractor_id)
    .ilike('email', d.email)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return { ok: true, message: SUCCESS };

  const geo = await resolveCounty(d.postcode);
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      source: 'directory',
      status: 'direct',
      contractor_id: d.contractor_id,
      full_name: d.name,
      phone: d.phone,
      email: d.email,
      postcode: d.postcode,
      job_hint: d.details,
      details: {
        category: 'directory',
        sent_to: contractor.business_name,
        listed_in: d.county ?? geo.county_name ?? null,
        name: d.name,
        phone: d.phone,
        email: d.email,
        postcode: d.postcode,
        details: d.details,
        county_id: geo.county_id ?? null,
        county: geo.county_name ?? null,
        town: geo.town ?? null,
      },
    })
    .select('id')
    .single();
  if (error || !lead) {
    return { error: 'Something went wrong sending your enquiry. Please try again or call us.' };
  }

  await admin.from('pending_emails').insert({
    kind: 'directory_enquiry',
    to_email: contractor.email,
    payload: {
      business_name: contractor.business_name,
      customer_name: d.name,
      customer_phone: d.phone,
      customer_email: d.email,
      postcode: d.postcode,
      county: geo.county_name ?? null,
      town: geo.town ?? null,
      details: d.details,
      lead_id: lead.id,
      reply_to: d.email,
    },
  });

  await notifyAdmins(
    `Directory enquiry for ${contractor.business_name}: ${d.name}`,
    `A customer wrote to ${contractor.business_name} through their ${d.county ? `${d.county} page` : 'directory'} listing. ` +
      `It went to them directly; nothing to do unless it comes back.\n\n` +
      `Name:      ${d.name}\n` +
      `Phone:     ${d.phone}\n` +
      `Email:     ${d.email}\n` +
      `Postcode:  ${d.postcode}\n` +
      `County:    ${geo.county_name ?? '(not resolved)'}\n` +
      `Wants:     ${d.details}\n`,
  );

  return { ok: true, message: SUCCESS };
}
