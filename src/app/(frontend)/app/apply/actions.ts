'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import { notifyAdmins } from '@/lib/adminNotify';
import { getCounties } from '@/lib/reference';
import { resolveCounty } from '@/lib/postcodes';
import { countiesWithinMiles } from '@/lib/radiusCoverage';
import { cleanSignupSource } from '@/lib/signupSource';
import type { FormState } from '@/lib/form';
import { CONDUCT_VERSION } from '@/lib/contractors/conduct';


export type LookupState = FormState & { lat?: number; lng?: number; county?: string; counties?: string[] };

const DOC_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const DOC_MAX = 8 * 1024 * 1024;

/** The base postcode → a position and the counties a radius from it reaches. */
export async function baseLookupAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const postcode = String(formData.get('base_postcode') || '').trim();
  const miles = Math.min(200, Math.max(5, Number(formData.get('radius')) || 25));
  if (!postcode) return { error: 'Enter your base postcode.' };
  // A radius change on a postcode already placed needs no second geocode.
  const knownLat = Number(formData.get('lat'));
  const knownLng = Number(formData.get('lng'));
  if (String(formData.get('placed') || '') === postcode && Number.isFinite(knownLat) && Number.isFinite(knownLng) && knownLat !== 0) {
    return { ok: true, lat: knownLat, lng: knownLng, county: String(formData.get('county') || '') || undefined, counties: countiesWithinMiles(knownLat, knownLng, miles) };
  }
  const geo = await resolveCounty(postcode);
  if (geo.lat == null || geo.lng == null) return { error: 'That postcode didn’t resolve. Check it and try again.' };
  return { ok: true, lat: geo.lat, lng: geo.lng, county: geo.county_name, counties: countiesWithinMiles(geo.lat, geo.lng, miles) };
}

const ApplySchema = z.object({
  business_name: z.string().trim().min(1, 'Your trading name is required.'),
  contact_name: z.string().trim().min(1, 'Your name is required.'),
  base_postcode: z.string().trim().min(3, 'Your base postcode is required.'),
  radius: z.coerce.number().int().min(5).max(200).catch(25),
  nationwide: z.enum(['on']).optional(),
  service_ids: z.array(z.coerce.number().int()).min(1, 'Pick at least one service.'),
  account_name: z.string().trim().min(1, 'The name on the account is required.'),
  sort_code: z.string().trim().regex(/^\d{2}-?\d{2}-?\d{2}$/, 'Sort code looks wrong (six digits).'),
  account_number: z.string().trim().regex(/^\d{8}$/, 'Account number is eight digits.'),
  conduct: z.literal('on', { message: 'Please agree to the terms and Code of Conduct.' }),
});

async function uploadDoc(userId: string, kind: string, file: unknown, index = 0): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > DOC_MAX) return null;
  const ext = DOC_TYPES[file.type];
  if (!ext) return null;
  const path = `${userId}/${kind}${index ? `-${index}` : ''}.${ext}`;
  const { error } = await createServiceRoleClient()
    .storage.from('contractor-documents')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) {
    console.error('[apply] document upload failed:', error.message);
    return null;
  }
  return path;
}

/**
 * The app's application (PRD task 9): the same contractors row /onboarding
 * creates, plus the checks — insurance certificate, optional certificates,
 * bank details, the Code of Conduct version — and counties derived from a
 * travel radius (or nationwide for the services picked).
 */
export async function submitApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect('/app');
  const parsed = ApplySchema.safeParse({
    business_name: formData.get('business_name'),
    contact_name: formData.get('contact_name'),
    base_postcode: formData.get('base_postcode'),
    radius: formData.get('radius'),
    nationwide: formData.get('nationwide') || undefined,
    service_ids: formData.getAll('service_ids'),
    account_name: formData.get('account_name'),
    sort_code: formData.get('sort_code'),
    account_number: formData.get('account_number'),
    conduct: formData.get('conduct'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;
  const insuranceFile = formData.get('insurance');
  if (!(insuranceFile instanceof File) || insuranceFile.size === 0) {
    return { error: 'We need a photo or PDF of your public liability insurance certificate.' };
  }
  if (!DOC_TYPES[insuranceFile.type]) {
    return { error: 'The insurance certificate needs to be a JPEG, PNG or WebP photo, or a PDF.' };
  }
  if (insuranceFile.size > DOC_MAX) {
    return { error: 'That insurance file is over 8MB. A photo from the camera, or a smaller PDF, will do.' };
  }
  // One application per account: an existing contractor (approved,
  // suspended or rejected) edits coverage and details from their account,
  // not by applying again.
  if ((await createServiceRoleClient().from('contractors').select('id').eq('id', user.id).maybeSingle()).data) {
    return { error: 'You already have a contractor account. Change your details from your dashboard.' };
  }

  const geo = await resolveCounty(d.base_postcode);
  const nationwide = d.nationwide === 'on';
  const allCounties = await getCounties();
  const countyNames = nationwide || geo.lat == null || geo.lng == null
    ? null
    : new Set(countiesWithinMiles(geo.lat, geo.lng, d.radius));
  let countyIds = nationwide
    ? allCounties.map((c) => c.id)
    : allCounties.filter((c) => countyNames?.has(c.name)).map((c) => c.id);
  if (countyIds.length === 0 && geo.county_id) countyIds = [geo.county_id];
  if (countyIds.length === 0) return { error: 'We couldn’t work out which counties you cover from that postcode. Check it and try again.' };

  const verifiedPhone = user.phone && user.phone_confirmed_at ? `+${user.phone.replace(/^\+/, '')}` : '';
  const supabase = await createClient();
  const { error: profErr } = await supabase.from('contractors').insert({
    id: user.id,
    business_name: d.business_name,
    contact_name: d.contact_name,
    phone: verifiedPhone,
    email: user.email ?? '',
    base_postcode: d.base_postcode.toUpperCase(),
    services: d.service_ids,
    base_lat: geo.lat ?? null,
    base_lng: geo.lng ?? null,
    status: 'pending',
    invite_radius_miles: nationwide ? 1000 : d.radius,
    services_only: nationwide,
    phone_verified_at: verifiedPhone ? user.phone_confirmed_at : null,
    conduct_version: CONDUCT_VERSION,
    conduct_accepted_at: new Date().toISOString(),
    signup_source: cleanSignupSource({ ...(user.user_metadata?.signup_source ?? {}), landing: 'app' }),
  });
  if (profErr) {
    return { error: `Could not save your application: ${profErr.message}` };
  }

  const admin = createServiceRoleClient();
  const [insurancePath, ...certPaths] = await Promise.all([
    uploadDoc(user.id, 'insurance', insuranceFile),
    ...formData.getAll('certificates').slice(0, 5).map((f, i) => uploadDoc(user.id, 'certificate', f, i + 1)),
  ]);
  await Promise.all([
    admin.from('contractors').update({
      insurance_path: insurancePath,
      certificate_paths: certPaths.filter((p): p is string => !!p),
    }).eq('id', user.id),
    admin.from('contractor_counties').upsert(
      countyIds.map((county_id) => ({ contractor_id: user.id, county_id })),
      { onConflict: 'contractor_id,county_id', ignoreDuplicates: true },
    ),
    admin.from('contractor_bank_details').upsert({
      contractor_id: user.id,
      account_name: d.account_name,
      sort_code: d.sort_code.replace(/-/g, '').replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3'),
      account_number: d.account_number,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contractor_id' }),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `New contractor application (app): ${d.business_name}`,
    `A contractor applied through the app and is awaiting approval.\n\n` +
      `Business:  ${d.business_name}\nContact:   ${d.contact_name}\nEmail:     ${user.email ?? '—'}\n` +
      `Phone:     ${verifiedPhone ? `${verifiedPhone} (verified by text)` : '—'}\nPostcode:  ${d.base_postcode}\n` +
      `Covers:    ${nationwide ? 'nationwide, for their services only' : `${d.radius} miles (${countyIds.length} counties)`}\n` +
      `Insurance: ${insurancePath ? 'uploaded' : 'MISSING'} · Certificates: ${certPaths.filter(Boolean).length} · Bank details: on file\n` +
      `Code of Conduct ${CONDUCT_VERSION} agreed.\n\nReview and approve: ${siteUrl}/admin/contractors`,
  );

  redirect('/app/apply/done');
}
