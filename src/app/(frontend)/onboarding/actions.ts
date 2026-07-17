'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { getCounties } from '@/lib/reference';
import type { FormState } from '@/lib/form';

const OnboardingSchema = z.object({
  business_name: z.string().trim().min(1, 'Business name is required.'),
  contact_name: z.string().trim().min(1, 'Contact name is required.'),
  phone: z.string().trim().min(5, 'Phone number is required.'),
  base_postcode: z.string().trim().min(3, 'Base postcode is required.'),
  service_ids: z.array(z.coerce.number().int()).default([]),
  county_ids: z.array(z.coerce.number().int()).min(1, 'Select at least one county.'),
});

export async function completeOnboardingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are not signed in. Please log in and try again.' };

  const parsed = OnboardingSchema.safeParse({
    business_name: formData.get('business_name'),
    contact_name: formData.get('contact_name'),
    phone: formData.get('phone'),
    base_postcode: formData.get('base_postcode'),
    service_ids: formData.getAll('service_ids'),
    county_ids: formData.getAll('county_ids'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  // Create the pending contractor profile as the signed-in user
  // (RLS: contractors_insert_self requires id = auth.uid()).
  const { error: profErr } = await supabase.from('contractors').insert({
    id: user.id,
    business_name: d.business_name,
    contact_name: d.contact_name,
    phone: d.phone,
    email: user.email ?? '',
    base_postcode: d.base_postcode,
    services: d.service_ids,
    status: 'pending',
  });
  // A duplicate means onboarding already ran (double submit / back button) —
  // treat that as done rather than an error.
  if (profErr && !profErr.message.includes('duplicate')) {
    return { error: `Could not save your profile: ${profErr.message}` };
  }

  const { error: ccErr } = await supabase
    .from('contractor_counties')
    .upsert(
      d.county_ids.map((county_id) => ({ contractor_id: user.id, county_id })),
      { onConflict: 'contractor_id,county_id', ignoreDuplicates: true },
    );
  if (ccErr) return { error: `Could not save your counties: ${ccErr.message}` };

  // Tell the admins a new application is waiting. Best-effort — never blocks
  // or fails onboarding.
  const counties = await getCounties();
  const countyNames = counties
    .filter((c) => d.county_ids.includes(c.id))
    .map((c) => c.name)
    .join(', ');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `New contractor signup: ${d.business_name}`,
    `A new contractor has completed onboarding and is awaiting approval.\n\n` +
      `Business:  ${d.business_name}\n` +
      `Contact:   ${d.contact_name}\n` +
      `Email:     ${user.email ?? '—'}\n` +
      `Phone:     ${d.phone}\n` +
      `Postcode:  ${d.base_postcode}\n` +
      `Counties:  ${countyNames || d.county_ids.length}\n\n` +
      `Review and approve: ${siteUrl}/admin/contractors`,
  );

  redirect('/account');
}
