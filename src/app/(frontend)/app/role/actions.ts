'use server';

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { nameFromUser } from '@/lib/app/userName';

/**
 * The role screen's one action (PRD task 5). "I need work done" creates the
 * customers row there and then, as claiming a job does
 * (lib/customers/claim.ts); "I'm a contractor" goes to the existing
 * contractor sign-up, which creates the contractors row once the business
 * details are in. Either way the next stop is the tabs via /app/continue.
 */
export async function chooseRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect('/app');
  const role = String(formData.get('role') || '');
  if (role !== 'customer' && role !== 'contractor') return { error: 'Choose one to continue.' };

  if (role === 'contractor') redirect('/onboarding');

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from('customers')
    .select('contact_name, phone')
    .eq('id', user.id)
    .maybeSingle();
  const { error } = await admin.from('customers').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      contact_name: existing?.contact_name ?? nameFromUser(user.user_metadata),
      phone: existing?.phone ?? user.phone ?? null,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.error('[app/role] customer upsert failed:', error);
    return { error: 'We could not save that just now. Please try again.' };
  }
  redirect('/app/continue');
}
