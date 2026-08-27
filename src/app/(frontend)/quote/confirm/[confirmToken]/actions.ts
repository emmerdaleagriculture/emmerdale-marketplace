'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import type { FormState } from '@/lib/form';

export async function confirmEmailQuoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get('confirm_token') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is not valid.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('confirm_email_quote', { p_confirm_token: token });
  if (error) {
    console.error('[sq] confirm_email_quote failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    switch (res.reason) {
      case 'closed':
        return {
          error:
            'This job closed before the price was confirmed — the customer accepted another price. Nothing else is needed from you.',
        };
      case 'superseded':
        return { error: 'A newer price of yours has replaced this one — nothing to confirm.' };
      default:
        return { error: 'This confirmation link has already been used.' };
    }
  }
  return {
    ok: true,
    message: 'Confirmed — your price is now in front of the customer. You can revise it any time from your pricing link.',
  };
}
