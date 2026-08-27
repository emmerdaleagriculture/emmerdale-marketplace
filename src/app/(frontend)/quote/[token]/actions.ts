'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { poundsInputToPence } from '@/lib/sealedQuotes/money';
import type { FormState } from '@/lib/form';

export type QuoteActionState = FormState & { closed?: boolean };

const QuoteSchema = z.object({
  token: z.string(),
  quote_type: z.enum(['total', 'rate']),
  price: z.string().trim().optional().or(z.literal('')),
  rate_value: z.string().trim().optional().or(z.literal('')),
  rate_minimum: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
});

/**
 * Price submission from the tokenised page (§17). One write path: this calls
 * the same submit_contractor_quote RPC that the confirmed email-parse route
 * uses. Late submissions into an awarded job get a calm refusal, never an
 * error state (§22).
 */
export async function submitQuoteAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const parsed = QuoteSchema.safeParse({
    token: formData.get('token'),
    quote_type: formData.get('quote_type'),
    price: formData.get('price') ?? '',
    rate_value: formData.get('rate_value') ?? '',
    rate_minimum: formData.get('rate_minimum') ?? '',
    notes: formData.get('notes') ?? '',
    valid_until: formData.get('valid_until') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;
  if (!isTokenFormat(d.token)) return { error: 'This link is not valid.' };

  let pricePence: number | null = null;
  let rateValuePence: number | null = null;
  let rateMinimumPence: number | null = null;

  if (d.quote_type === 'total') {
    pricePence = poundsInputToPence(d.price ?? '');
    if (pricePence === null) return { error: 'Enter your price in pounds, e.g. 450.' };
  } else {
    rateValuePence = poundsInputToPence(d.rate_value ?? '');
    if (rateValuePence === null) return { error: 'Enter your rate per acre, e.g. 90.' };
    if (d.rate_minimum) {
      rateMinimumPence = poundsInputToPence(d.rate_minimum);
      if (rateMinimumPence === null) return { error: 'The minimum needs to be an amount, e.g. 250.' };
    }
  }

  const admin = createServiceRoleClient();
  // Generated RPC types can't express nullable args; the SQL accepts null.
  const { data, error } = await admin.rpc('submit_contractor_quote', {
    p_token: d.token,
    p_quote_type: d.quote_type,
    p_price_pence: pricePence as number,
    p_rate_value_pence: rateValuePence as number,
    p_rate_minimum_pence: rateMinimumPence as number,
    p_site_visit: formData.get('site_visit') === 'on',
    p_notes: (d.notes || null) as string,
    p_valid_until: (d.valid_until || null) as string,
    p_source: 'form',
    p_confirmed: true,
  });
  if (error) {
    console.error('[sq] submit_contractor_quote failed:', error);
    return { error: 'Something went wrong sending your price — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    switch (res.reason) {
      case 'closed':
        return {
          closed: true,
          message:
            'This one’s been taken — the customer accepted another price before yours came in. It happens with first-come jobs; nothing else is needed from you.',
        };
      case 'rate_needs_area':
        return { error: 'This job has no usable acreage for a per-acre rate — give a total price instead.' };
      case 'declined':
        return { error: 'You’ve passed on this job. If that’s changed, get in touch and we’ll re-open it.' };
      case 'not_found':
        return { error: 'This link is not valid.' };
      default:
        return { error: 'That didn’t go through — please check the form and try again.' };
    }
  }
  return { ok: true, message: 'Price sent. You can revise it any time until the job is taken.' };
}

export async function declineInvitationAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is not valid.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('decline_invitation', {
    p_token: token,
    p_reason: reason,
  });
  if (error) {
    console.error('[sq] decline_invitation failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    if (res.reason === 'already_priced') {
      return { error: 'You’ve already priced this job — a decline would withdraw it, which needs a word with us first.' };
    }
    return { error: 'This job has already closed.' };
  }
  return { ok: true, message: 'Noted — thanks for the quick answer. It helps us send you the right jobs.' };
}
