'use server';

import { z } from 'zod';
import { emailDeliveryError } from '@/lib/email/deliverable';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { requestCountry } from '@/lib/requestGeo';
import { countryByCode, OTHER_COUNTRY_CODE } from '@/lib/countries';
import type { FormState } from '@/lib/form';

const Schema = z.object({
  side: z.enum(['customer', 'contractor']),
  country: z.string().trim().regex(/^[A-Z]{2}$/, 'Choose your country.'),
  place: z.string().trim().max(120).default(''),
  details: z.string().trim().max(600).default(''),
  email: z.string().trim().email('An email address is required.'),
  source_path: z.string().trim().max(120).default(''),
});

const SUCCESS = 'Thanks. We’ll email you when we open where you are.';

/**
 * Register interest from outside the UK (phase 0 of going worldwide): one
 * row in expansion_interest, one line to the admins. The same invisible bot
 * traps as the enquiry form. The country they picked is the record; the
 * country Vercel saw is kept beside it, because a visitor in Dublin asking
 * about a farm in Spain is two facts, not one.
 */
export async function registerInterestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (honeypot || (renderedAt > 0 && Date.now() - renderedAt < 3000)) {
    return { ok: true, message: SUCCESS };
  }

  const parsed = Schema.safeParse({
    side: formData.get('side'),
    country: String(formData.get('country') ?? '').toUpperCase(),
    place: formData.get('place'),
    details: formData.get('details'),
    email: formData.get('email'),
    source_path: formData.get('source_path'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  const country = countryByCode(d.country);
  // The form never offers the UK; a stale or hand-made post must not put
  // UK interest on the overseas list.
  if (d.country === 'GB') return { error: 'This list is for outside the UK. In the UK, describe your job at /start.' };
  if (!country && d.country !== OTHER_COUNTRY_CODE) return { error: 'Choose your country.' };
  if (!country && !d.place) return { error: 'Tell us which country you’re in.' };

  const emailError = await emailDeliveryError(d.email, 'We’ll write to this address');
  if (emailError) return { error: emailError };

  const countryName = country?.name ?? d.place;
  const email = d.email.toLowerCase();
  const admin = createServiceRoleClient();
  // Once per person, country and side (expansion_interest_once_idx): a
  // refresh-and-resend is told thanks again and changes nothing, and the
  // admins hear about each person once.
  const { data: inserted, error } = await admin
    .from('expansion_interest')
    .upsert(
      {
        side: d.side,
        country_code: d.country,
        country_name: countryName,
        place: d.place || null,
        details: d.details || null,
        email,
        ip_country: await requestCountry(),
        source_path: d.source_path || null,
      },
      { onConflict: 'email,country_code,side', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    console.error('[outside-the-uk] insert failed:', error.message);
    return { error: 'Something went wrong saving that. Please try again.' };
  }
  if (!inserted || inserted.length === 0) return { ok: true, message: SUCCESS };

  await notifyAdmins(
    `Outside the UK: ${d.side} in ${countryName}`,
    `A ${d.side} outside the UK has asked to hear when we open there.\n\n` +
      `Country:  ${countryName}${d.place && country ? ` (${d.place})` : ''}\n` +
      `Email:    ${d.email}\n` +
      (d.details ? `Says:     ${d.details}\n` : '') +
      `\nAll registrations: /admin/seo/countries`,
  );

  return { ok: true, message: SUCCESS };
}
