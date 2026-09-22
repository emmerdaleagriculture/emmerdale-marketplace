'use server';

import { z } from 'zod';
import { emailDeliveryError } from '@/lib/email/deliverable';
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
  // Required: quotes and follow-ups go out by email.
  email: z.string().trim().email('An email address is required.'),
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

  // A quote we can't deliver is a lead we never had — check the domain exists
  // while they can still correct it.
  const emailError = await emailDeliveryError(
    parsed.data.email,
    'Our reply goes to this address',
  );
  if (emailError) return { error: emailError };
  const d = parsed.data;
  const label = CATEGORIES[d.category];

  // Resolve the county from the postcode now, so the admin sees the location and
  // coverage on the lead and publishing to the contractor network is one click.
  // Never blocks the enquiry — an unresolvable postcode just stores no county.
  const geo = await resolveCounty(d.postcode);

  const admin = createServiceRoleClient();
  const { data: lead, error } = await admin.from('leads').insert({
    source: d.category,
    full_name: d.name,
    phone: d.phone,
    email: d.email,
    postcode: d.postcode,
    job_hint: d.details,
    details: {
      category: d.category,
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
    return { error: 'Something went wrong saving your enquiry — please try again or call us.' };
  }

  // Straight to the contractors who cover the county. Fire-and-log, like
  // distribution in start/actions.ts: a failure here must never cost the
  // customer their enquiry, and anything that does not convert simply stays
  // a pending lead — which is exactly the behaviour this replaces.
  const converted = await autoConvertEnquiry(admin, lead.id, d, geo);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `New ${label} enquiry: ${d.name}`,
    `A customer has submitted a ${label} enquiry via the website.\n\n` +
      `Name:      ${d.name}\n` +
      `Phone:     ${d.phone}\n` +
      `Email:     ${d.email}\n` +
      `Postcode:  ${d.postcode}\n` +
      `County:    ${geo.county_name ?? '(not resolved — check the postcode)'}\n` +
      `Wants:     ${d.details}\n\n` +
      (converted
        ? `ALREADY SENT to contractors covering ${geo.county_name}: ${siteUrl}/admin/submissions/${converted}\n` +
          `Withdraw it there if it shouldn't have gone out.\n\n`
        : `NOT sent automatically — it is waiting for you: ${siteUrl}/admin/leads\n\n`) +
      `Review in the leads queue: ${siteUrl}/admin/leads`,
  );

  return { ok: true, message: SUCCESS_MESSAGE };
}

/** The vertical's canonical service, and how its job is titled. */
const AUTO_CONVERT: Record<string, { serviceId: number; title: string }> = {
  hay: { serviceId: 16, title: 'Hay, straw or haylage wanted' },
  'tractor-hire': { serviceId: 17, title: 'Tractor hire for an event' },
};

/** Enough words to be a real enquiry rather than a test or a slip. */
const MIN_DETAIL = 15;

/**
 * Publish a portal enquiry to the contractors covering its county.
 *
 * Returns the new job id, or null when it did not convert — in which case the
 * lead stays `pending` and an operator picks it up, which is what happened to
 * every enquiry before this existed. Never throws: the caller has already
 * saved the customer's enquiry and must not fail it on our account.
 *
 * It lands in the SEALED-QUOTE flow (job_submissions), not the legacy `jobs`
 * board. Two systems for the same thing meant portal enquiries never appeared
 * on /admin/ops, which reads admin_submission_board — so the work was
 * invisible on the board built to watch it.
 *
 * Distribution matches on county and service, so a submission whose postcode
 * never resolved still reaches the right contractors — county is the fallback,
 * not a replacement. Where a postcode exists it is carried, because the
 * invitation shows its district and that is what a contractor prices from.
 *
 * It can be wrong: one enquiry came from a Plymouth postcode for a wedding at
 * Torbay, thirty miles away. The customer's own words carry that — "Torbay
 * Party Barn" was in the message — and an operator can correct the submission.
 *
 * Known rough edge: both verticals are area_priced = false and the one hay
 * job that has been through this flow drew 14 invitations, 5 opens and no
 * prices at all. The flow is built around an acreage; hay and a wedding
 * tractor are not that shape.
 *
 * Only the two portal verticals convert. Facebook lead-ads arrive through
 * /api/leads instead, and 12 of their 13 leads have been dismissed as junk;
 * routing those to contractors automatically would be a good way to teach the
 * network to ignore our email.
 */
async function autoConvertEnquiry(
  admin: ReturnType<typeof createServiceRoleClient>,
  leadId: string,
  d: { category: string; name: string; phone: string; email: string; details: string; postcode: string },
  geo: { county_id?: number | null; county_name?: string | null },
): Promise<string | null> {
  try {
    const spec = AUTO_CONVERT[d.category];
    // An unresolved postcode has no county to publish to, and a two-word
    // enquiry is not worth sixteen contractors' attention.
    if (!spec || !geo.county_id || d.details.trim().length < MIN_DETAIL) return null;

    // The same person twice in an hour is a double-submit or a bot, not two
    // jobs. The second one waits for a human.
    const { count: recent } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('email', d.email)
      .eq('status', 'converted')
      .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if (recent && recent > 0) return null;

    const now = new Date();
    const { data: sub, error } = await admin
      .from('job_submissions')
      .insert({
        status: 'confirmed',
        confirmed_at: now.toISOString(),
        // The customer's own words are the job: there is no separate
        // description on this form, and service_verbatim is what a contractor
        // reads on the quote page.
        raw_text: d.details,
        service_verbatim: d.details,
        service_id: spec.serviceId,
        // They chose the vertical by using its form — that IS the choice.
        service_confirmed: true,
        county_id: geo.county_id,
        // The postcode they gave. County is the FALLBACK when there isn't
        // one, not a replacement for one: a contractor needs the district to
        // judge whether a job is worth pricing, and "somewhere in Surrey" is
        // not something anyone can price.
        postcode: d.postcode || null,
        contact_name: d.name,
        contact_phone: d.phone,
        contact_email: d.email,
        contact_preference: 'either',
        // Same window /start uses, so a price is not open-ended.
        expires_at: new Date(now.getTime() + 10 * 86400_000).toISOString(),
      })
      .select('id')
      .single();
    if (error || !sub) {
      console.error('[enquiry] auto-convert insert failed:', error);
      return null;
    }

    // submission_id, not job_id: that column's foreign key points at the
    // legacy jobs table, and writing a submission id there fails silently and
    // leaves the lead sitting in the queue while its work is already out.
    const { error: linkError } = await admin
      .from('leads')
      .update({ status: 'converted', submission_id: sub.id })
      .eq('id', leadId);
    if (linkError) console.error('[enquiry] lead link failed:', linkError);

    // Out to the contractors covering that county who do this work. Unlike
    // the legacy board this matches on service as well, so a hay enquiry does
    // not land with someone who only tops paddocks.
    const { data: dist, error: distError } = await admin.rpc('distribute_submission', {
      p_submission_id: sub.id,
    });
    if (distError) {
      console.error('[enquiry] distribute_submission failed:', distError);
    } else {
      console.log('[enquiry] distributed:', JSON.stringify(dist));
    }
    return sub.id;
  } catch (err) {
    console.error('[enquiry] auto-convert failed:', err);
    return null;
  }
}
