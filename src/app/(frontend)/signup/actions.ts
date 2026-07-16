'use server';

import { z } from 'zod';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
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

const SUCCESS_MESSAGE =
  'Application received. Check your email to confirm your address — then we’ll review your application and email you when you’re approved.';

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Bot traps: a hidden field real users never see, and a minimum time-to-fill.
  // Pretend success so bots can't tell they were caught.
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (honeypot || (renderedAt > 0 && Date.now() - renderedAt < 3000)) {
    return { ok: true, message: SUCCESS_MESSAGE };
  }

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

  // Supabase verifies the Turnstile token when captcha protection is enabled
  // for the project; without a valid token it rejects the signup.
  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;

  // Create the auth user (sends a confirmation email if the project requires it).
  const supabase = await createClient();
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
      captchaToken,
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

  // Tell the admins a new application is waiting. Best-effort — never blocks
  // or fails the signup.
  const { data: countyRows } = await admin
    .from('counties')
    .select('name')
    .in('id', d.county_ids);
  const countyNames = (countyRows ?? []).map((c) => c.name).join(', ');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `New contractor signup: ${d.business_name}`,
    `A new contractor has applied to join the network and is awaiting approval.\n\n` +
      `Business:  ${d.business_name}\n` +
      `Contact:   ${d.contact_name}\n` +
      `Email:     ${d.email}\n` +
      `Phone:     ${d.phone}\n` +
      `Postcode:  ${d.base_postcode}\n` +
      `Counties:  ${countyNames || d.county_ids.length}\n\n` +
      `Review and approve: ${siteUrl}/admin/contractors`,
  );

  return { ok: true, message: SUCCESS_MESSAGE };
}
