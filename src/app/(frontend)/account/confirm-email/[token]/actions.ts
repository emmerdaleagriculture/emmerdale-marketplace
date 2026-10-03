'use server';

import { revalidatePath } from 'next/cache';
import { confirmEmail } from '@/lib/contractors/emailConfirm';
import type { FormState } from '@/lib/form';

export async function confirmEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') || '');
  if (!token) return { error: 'This link is incomplete.' };

  const res = await confirmEmail(token);
  if (!res.ok) return { error: res.error };

  revalidatePath('/account');
  const jobs =
    res.invited > 0
      ? ` ${res.invited} open ${res.invited === 1 ? 'job is' : 'jobs are'} on ${res.invited === 1 ? 'its' : 'their'} way to you now.`
      : ' New jobs in your counties will come to you from now on.';
  return {
    ok: true,
    message: `Thanks, ${res.email} is confirmed. Sign in with it from now on.${jobs}`,
  };
}
