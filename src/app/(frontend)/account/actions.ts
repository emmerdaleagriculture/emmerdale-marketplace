'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolveCounty } from '@/lib/postcodes';
import type { FormState } from '@/lib/form';

const ProfileSchema = z.object({
  business_name: z.string().trim().min(1, 'Business name is required.'),
  contact_name: z.string().trim().min(1, 'Contact name is required.'),
  phone: z.string().trim().min(5, 'Phone number is required.'),
  base_postcode: z.string().trim().min(3, 'Base postcode is required.'),
  county_ids: z.array(z.coerce.number().int()).min(1, 'Select at least one county.'),
  service_ids: z.array(z.coerce.number().int()).min(1, 'Pick at least one service.'),
});

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are not signed in.' };

  const parsed = ProfileSchema.safeParse({
    business_name: formData.get('business_name'),
    contact_name: formData.get('contact_name'),
    phone: formData.get('phone'),
    base_postcode: formData.get('base_postcode'),
    county_ids: formData.getAll('county_ids'),
    service_ids: formData.getAll('service_ids'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;
  const notify = formData.get('notify_new_jobs') === 'on';

  // Refresh display-only base coords when the postcode changes (§15).
  const geo = await resolveCounty(d.base_postcode);

  // Update own profile (RLS: contractors_update_own; status is trigger-guarded).
  const { error: upErr } = await supabase
    .from('contractors')
    .update({
      business_name: d.business_name,
      contact_name: d.contact_name,
      phone: d.phone,
      base_postcode: d.base_postcode,
      services: d.service_ids,
      base_lat: geo.lat ?? null,
      base_lng: geo.lng ?? null,
      notify_new_jobs: notify,
    })
    .eq('id', user.id);
  if (upErr) return { error: `Could not save: ${upErr.message}` };

  // Replace county coverage (RLS: cc_delete_own / cc_insert_own).
  await supabase.from('contractor_counties').delete().eq('contractor_id', user.id);
  if (d.county_ids.length > 0) {
    const { error: ccErr } = await supabase
      .from('contractor_counties')
      .insert(d.county_ids.map((county_id) => ({ contractor_id: user.id, county_id })));
    if (ccErr) return { error: `Could not save counties: ${ccErr.message}` };
  }

  revalidatePath('/account');
  return { ok: true, message: 'Your details have been saved.' };
}
