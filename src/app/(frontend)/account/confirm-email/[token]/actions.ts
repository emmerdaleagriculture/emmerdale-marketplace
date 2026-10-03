'use server';

import { confirmEmail } from '@/lib/contractors/emailConfirm';
import type { FormState } from '@/lib/form';

export async function confirmEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') || '');
  if (!token) return { error: 'This link is incomplete.' };

  const res = await confirmEmail(token);
  if (!res.ok) return { error: res.error };

  // No revalidatePath here. /account renders per request, so there is
  // nothing cached to clear, and revalidating makes Next re-render THIS page
  // in the same response — where the link now reads as used, and the "used"
  // card replaces the form along with this success message.
  const jobs =
    res.invited > 0
      ? ` ${res.invited} open ${res.invited === 1 ? 'job is' : 'jobs are'} on ${res.invited === 1 ? 'its' : 'their'} way to you now.`
      : ' New jobs in your counties will come to you from now on.';
  return {
    ok: true,
    message: `Thanks, ${res.email} is confirmed. Sign in with it from now on.${jobs}`,
  };
}
