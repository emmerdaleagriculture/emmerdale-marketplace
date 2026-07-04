'use server';

import { z } from 'zod';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

const SignupSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  business_name: z.string().trim().min(1, 'Business name is required.'),
  contact_name: z.string().trim().min(1, 'Contact name is required.'),
  phone: z.string().trim().min(5, 'Phone number is required.'),
  base_postcode: z.string().trim().min(3, 'Base postcode is required.'),
  service_ids: z.array(z.coerce.number().int()).default([]),
  county_ids: z.array(z.coerce.number().int()).min(1, 'Select at least one county.'),
  accept: z.literal('on', { message: 'You must accept the terms and privacy policy.' }),
});

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    business_name: formData.get('business_name'),
    contact_name: formData.get('contact_name'),
    phone: formData.get('phone'),
    base_postcode: formData.get('base_postcode'),
    service_ids: formData.getAll('service_ids'),
    county_ids: formData.getAll('county_ids'),
    accept: formData.get('accept'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  // Create the auth user (sends a confirmation email if the project requires it).
  const supabase = await createClient();
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (signUpErr) {
    return { error: signUpErr.message };
  }
  const userId = signUp.user?.id;
  // Supabase obfuscates re-signups (returns a user with no identities). Treat as
  // "email already in use" rather than leaking which addresses are registered.
  if (!userId || (signUp.user && signUp.user.identities?.length === 0)) {
    return { error: 'That email is already registered. Try logging in instead.' };
  }

  // Create the pending contractor profile with the service role (works whether
  // or not the account is confirmed yet).
  const admin = createServiceRoleClient();
  const { error: profErr } = await admin.from('contractors').insert({
    id: userId,
    business_name: d.business_name,
    contact_name: d.contact_name,
    phone: d.phone,
    email: d.email,
    base_postcode: d.base_postcode,
    services: d.service_ids,
    status: 'pending',
  });
  if (profErr && !profErr.message.includes('duplicate')) {
    return { error: `Could not save your profile: ${profErr.message}` };
  }

  if (d.county_ids.length > 0) {
    await admin
      .from('contractor_counties')
      .upsert(
        d.county_ids.map((county_id) => ({ contractor_id: userId, county_id })),
        { onConflict: 'contractor_id,county_id', ignoreDuplicates: true },
      );
  }

  return {
    ok: true,
    message:
      'Application received. Check your email to confirm your address — then we’ll review your application and email you when you’re approved.',
  };
}
