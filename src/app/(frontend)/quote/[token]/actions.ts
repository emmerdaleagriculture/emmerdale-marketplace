'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { poundsInputToPence } from '@/lib/sealedQuotes/money';
import { CLIENT_NOTE_MAX, clientNoteProblem } from '@/lib/sealedQuotes/clientNote';
import type { FormState } from '@/lib/form';
import { revalidatePath } from 'next/cache';
import { getInvitationByToken } from '@/lib/sealedQuotes/data';
import { getThreadState, markThreadRead } from '@/lib/sealedQuotes/messages';
import { messageProblem, normaliseMessage, postRefusal } from '@/lib/sealedQuotes/messageText';

export type QuoteActionState = FormState & { closed?: boolean };

const QuoteSchema = z.object({
  token: z.string(),
  quote_type: z.enum(['total', 'rate', 'unit']),
  price: z.string().trim().optional().or(z.literal('')),
  rate_value: z.string().trim().optional().or(z.literal('')),
  rate_minimum: z.string().trim().optional().or(z.literal('')),
  unit_label: z.string().trim().max(24).optional().or(z.literal('')),
  unit_quantity: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  // Shown to the customer. Capped generously here so an over-long note gets
  // clientNoteProblem's sentence rather than a bare zod message.
  note_to_client: z.string().trim().max(2000).optional().or(z.literal('')),
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
    unit_label: formData.get('unit_label') ?? '',
    unit_quantity: formData.get('unit_quantity') ?? '',
    notes: formData.get('notes') ?? '',
    note_to_client: formData.get('note_to_client') ?? '',
    valid_until: formData.get('valid_until') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;
  if (!isTokenFormat(d.token)) return { error: 'This link is not valid.' };

  // Checked before the price is even converted: nothing reviews this note
  // between here and the customer reading it.
  const noteProblem = clientNoteProblem(d.note_to_client ?? '');
  if (noteProblem) return { error: noteProblem };
  const noteToClient = (d.note_to_client ?? '').trim().slice(0, CLIENT_NOTE_MAX);

  let pricePence: number | null = null;
  let rateValuePence: number | null = null;
  let rateMinimumPence: number | null = null;

  let unitQuantity: number | null = null;

  if (d.quote_type === 'unit') {
    // Rate and quantity both, because the customer accepts one figure and
    // pays a deposit against it — a rate alone is not something to accept.
    rateValuePence = poundsInputToPence(d.rate_value ?? '');
    if (rateValuePence === null) return { error: 'Enter your price per unit, e.g. 12.' };
    if (!d.unit_label) return { error: 'Say what one unit is — a bale, a day, a load.' };
    const qty = Number(d.unit_quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { error: 'Enter how many, e.g. 20.' };
    }
    unitQuantity = qty;
  } else if (d.quote_type === 'total') {
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
    // Tick = VAT is in the figure, untick = there is none in it. 'unspecified'
    // is reserved for prices that arrived by email parse, where nobody asked.
    p_price_basis: formData.get('includes_vat') === 'on' ? 'inc_vat' : 'no_vat',
    p_note_to_client: (noteToClient || null) as string,
    p_unit_label: (d.unit_label || null) as string,
    p_unit_quantity: unitQuantity as number,
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
      case 'unit_needs_quantity':
        return { error: 'A per-unit price needs the unit and how many.' };
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

export type MessageActionState = FormState & { body?: string };

/**
 * A message to the customer from the pricing page. The page's token is the
 * thread — one per invitation — so there is nothing else to choose. A refusal
 * hands the words back so they can be reworded rather than retyped.
 */
export async function sendContractorMessageAction(
  _prev: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const token = String(formData.get('token') ?? '');
  const body = normaliseMessage(String(formData.get('body') ?? ''));
  if (!isTokenFormat(token)) return { error: 'This link is not valid.', body };

  const invitation = await getInvitationByToken(token);
  if (!invitation) return { error: 'This link is not valid.', body };

  const state = await getThreadState(invitation.id);
  if (state === 'closed') return { error: postRefusal('closed'), body };
  const problem = messageProblem(body, 'contractor', state);
  if (problem) return { error: problem, body };

  const { data, error } = await createServiceRoleClient().rpc('sq_post_message', {
    p_invitation_id: invitation.id,
    p_sender: 'contractor',
    p_body: body,
    p_checked_as: state,
  });
  const res = data as { ok: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    if (error) console.error('[sq] contractor message failed:', error.message);
    return { error: postRefusal(res?.reason), body };
  }
  revalidatePath(`/quote/${token}`);
  return { ok: true };
}

/** The contractor has the thread open in a browser. */
export async function markContractorThreadReadAction(token: string): Promise<void> {
  if (!isTokenFormat(token)) return;
  const invitation = await getInvitationByToken(token);
  if (invitation) await markThreadRead(invitation.id, 'contractor');
}
