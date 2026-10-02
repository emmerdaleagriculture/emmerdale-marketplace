'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { closeCustomer } from '@/lib/closeCustomer';
import type { FormState } from '@/lib/form';

/** The signed-in customer closes their own account. */
export async function closeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get('confirm') ?? '') !== 'close') return { error: 'Type "close" to confirm.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'You need to be signed in.' };

  const res = await closeCustomer(user.email);
  if ('error' in res) return res;
  await supabase.auth.signOut();
  redirect('/?account=closed');
}
