'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import type { FormState } from '@/lib/form';
import { formatGBP, poundsInputToPence } from '@/lib/sealedQuotes/money';
import { CLIENT_NOTE_MAX, clientNoteProblem } from '@/lib/sealedQuotes/clientNote';
import { flagOffPlatform } from '@/lib/sealedQuotes/offPlatformAlert';

/**
 * First-contact log (§25): the signed-in winner records that they've been in
 * touch. The RPC verifies the job really is theirs; the session supplies who
 * "they" are.
 */
export async function logFirstContactAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to log contact.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  if (!submissionId) return { error: 'Something went wrong. Refresh and try again.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('log_first_contact', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
  });
  if (error) {
    console.error('[sq] log_first_contact failed:', error);
    return { error: 'That didn’t go through. Please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    if (res.reason === 'not_yours') return { error: 'This job isn’t assigned to your account.' };
    return { error: 'This job has moved on. Refresh to see its current state.' };
  }
  revalidatePath('/won');
  return { ok: true, message: 'Logged, thanks. Good luck with the job.' };
}

/**
 * "I've finished" (§25): the contractor's half of completion. It does not
 * complete the job — it moves it to completed_by_contractor and asks the
 * customer to confirm, which is what releases payment.
 */
export async function markDoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to update a job.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  if (!submissionId) return { error: 'Something went wrong. Refresh and try again.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('mark_completed_by_contractor', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
  });
  if (error) {
    console.error('[sq] mark_completed_by_contractor failed:', error);
    return { error: 'That didn’t go through. Please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    if (res.reason === 'not_yours') return { error: 'This job isn’t assigned to your account.' };
    return { error: 'This job has moved on. Refresh to see its current state.' };
  }
  revalidatePath('/won');
  return { ok: true, message: 'Marked done. We’ve asked the customer to confirm.' };
}

/**
 * Extra work the contractor proposes on a job they've won (contractor terms
 * clause 5: extras go through us). Makes a job of its own, held for them
 * with their price on it, and emails the customer — who accepts and pays a
 * deposit on their job page, or ignores it. The RPC checks the job is
 * theirs; the session says who they are.
 */
export async function proposeExtraWorkAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to propose extra work.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  const description = String(formData.get('description') ?? '').trim();
  const basis = String(formData.get('price_basis') ?? 'unspecified');
  const pence = poundsInputToPence(String(formData.get('price') ?? ''));
  const note = String(formData.get('note_to_client') ?? '').trim().slice(0, CLIENT_NOTE_MAX);
  if (!submissionId) return { error: 'Something went wrong. Refresh and try again.' };
  if (description.length < 3) return { error: 'Say what the extra work is.' };
  if (description.length > 200) return { error: 'Keep the description under 200 characters.' };
  if (pence === null) return { error: 'Enter your price in pounds, e.g. 250.' };
  // The description is customer-facing too (email body, job page heading),
  // so it gets the same screen as the note: no prices, no contact details.
  const descriptionProblem = clientNoteProblem(description);
  const noteProblem = clientNoteProblem(note);
  if (descriptionProblem || noteProblem) {
    await flagOffPlatform({
      text: [description, note],
      where: 'extra-work proposal',
      sender: 'contractor',
      submissionId,
      contractorId: user.id,
    });
    return { error: descriptionProblem ? `In the description: ${descriptionProblem}` : noteProblem! };
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('contractor_add_extra_work', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
    p_description: description,
    p_contractor_price_pence: pence,
    p_price_basis: basis,
    ...(note ? { p_note_to_client: note } : {}),
  });
  if (error) {
    console.error('[sq] contractor_add_extra_work failed:', error);
    return { error: 'That didn’t go through. Please try again.' };
  }
  const res = data as { ok: boolean; reason?: string; id?: string; client_price_pence?: number };
  if (!res.ok) {
    const why: Record<string, string> = {
      not_yours: 'This job isn’t assigned to your account.',
      one_open_already:
        'The customer already has an extra-work price waiting on this job. Wait for their answer, or contact us to change it.',
      not_booked: 'Extra work can only be proposed on a booked job.',
      bad_description: 'Keep the description between 3 and 200 characters.',
      bad_price: 'Enter a price above zero.',
      bad_basis: 'Pick a VAT option.',
    };
    return { error: why[res.reason ?? ''] ?? 'That didn’t go through. Nothing was sent.' };
  }

  const { data: contractor } = await admin
    .from('contractors')
    .select('business_name')
    .eq('id', user.id)
    .maybeSingle();
  await notifyAdmins(
    `Extra work proposed: ${contractor?.business_name ?? 'a contractor'}`,
    [
      `${contractor?.business_name ?? 'A contractor'} has proposed extra work on a booked job: ` +
        `"${description}" at ${formatGBP(pence)} to them, ${formatGBP(res.client_price_pence ?? 0)} to the customer.`,
      'The customer has been emailed and can accept it on their job page.',
      '',
      `Source job: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/submissions/${submissionId}`,
      `Extra work: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/submissions/${res.id ?? ''}`,
    ].join('\n'),
  );

  revalidatePath('/won');
  return {
    ok: true,
    message: `Sent. The customer sees ${formatGBP(res.client_price_pence ?? 0)} and can accept it on their job page. We’ll tell you if they do.`,
  };
}

const INVOICE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The contractor's invoice for a finished job.
 *
 * By the time this is used the customer has confirmed, the money is held and
 * the payout is owed — the invoice is the last piece of paper between the two.
 * It used to arrive by email or not at all, with nothing on the job saying
 * which, so a payment could sit waiting on something nobody could see.
 *
 * The session says who is asking and the row says whose job it is; those have
 * to agree. A photograph of a paper invoice is as valid as a PDF — most of
 * this network will be standing in a yard with a phone.
 */
export async function uploadInvoiceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to send your invoice.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  const file = formData.get('invoice');
  if (!submissionId) return { error: 'Something went wrong. Refresh and try again.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file first.' };
  if (file.size > INVOICE_MAX_BYTES) {
    return { error: 'That file is over 10MB. Please send a smaller one.' };
  }
  const ext = INVOICE_TYPES[file.type];
  if (!ext) return { error: 'Send a PDF or a photo (JPG, PNG).' };

  // Ticked = the invoice is the quoted price. Otherwise the figure it comes
  // to and why, checked by us before the customer is asked for anything.
  const matchesQuote = formData.get('matches_quote') === 'on';
  const invoicedPence = matchesQuote ? null : poundsInputToPence(String(formData.get('invoiced') ?? ''));
  const invoiceNote = String(formData.get('invoice_note') ?? '').trim().slice(0, 1000);
  if (!matchesQuote) {
    if (invoicedPence === null) {
      return { error: 'Tick the box if your invoice matches your quote, or enter what it comes to.' };
    }
    if (invoiceNote.length < 3) return { error: 'Tell us what’s different from the quote.' };
  }

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('id, status, awarded_contractor_id, contact_name, accepted_client_quote_id, service_verbatim, service:services(name)')
    .eq('id', submissionId)
    .maybeSingle();
  if (!js) return { error: 'We couldn’t find that job.' };
  if (js.awarded_contractor_id !== user.id) {
    return { error: 'This job isn’t assigned to your account.' };
  }
  if (!['completed', 'paid'].includes(js.status)) {
    return { error: 'Send your invoice once the customer has confirmed the work is done.' };
  }

  // Fixed path per job: sending a corrected invoice replaces the wrong one
  // rather than leaving us holding two and guessing which to pay.
  const path = `${submissionId}/invoice.${ext}`;
  const { error: upErr } = await admin.storage
    .from('contractor-invoices')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) {
    console.error('[sq] invoice upload failed:', upErr);
    return { error: 'That didn’t upload. Please try again.' };
  }

  const { error: updErr } = await admin
    .from('job_submissions')
    .update({
      contractor_invoice_path: path,
      contractor_invoice_name: file.name.slice(0, 200),
      contractor_invoice_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (updErr) {
    console.error('[sq] invoice record failed:', updErr);
    return { error: 'Uploaded, but we couldn’t record it. Please tell us.' };
  }

  const { data: recorded, error: amtErr } = await admin.rpc('sq_record_invoice_amount', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
    p_invoiced_pence: invoicedPence,
    p_note: invoiceNote || null,
  });
  const amount = recorded as
    | { ok: boolean; reason?: string; status?: string; quoted_pence?: number; invoiced_pence?: number }
    | null;
  if (amtErr || !amount?.ok) {
    console.error('[sq] invoice amount not recorded:', amtErr?.message ?? amount?.reason);
    return { error: 'Uploaded, but we couldn’t record the amount. Please tell us what it comes to.' };
  }
  const differs = amount.status === 'pending';

  const { data: contractor } = await admin
    .from('contractors')
    .select('business_name, email')
    .eq('id', user.id)
    .maybeSingle();

  // Tell them we have it, and when it is paid: once the customer's funds have
  // cleared into our account, not the moment their card goes through. The
  // amount is the contractor's own price on the accepted quote — the figure
  // they expect to see, so a wrong one is caught here and not at payout.
  const { data: accepted } = js.accepted_client_quote_id
    ? await admin
        .from('client_quotes')
        .select('cq:contractor_quotes(contractor_price_pence)')
        .eq('id', js.accepted_client_quote_id)
        .maybeSingle()
    : { data: null };
  const owedPence =
    (accepted?.cq as { contractor_price_pence: number } | null)?.contractor_price_pence ?? null;
  if (contractor?.email) {
    const { error: mailErr } = await admin.from('pending_emails').insert({
      kind: 'sq_invoice_received',
      to_email: contractor.email,
      payload: {
        submission_id: submissionId,
        contact_name: js.contact_name,
        service: (js.service as { name: string } | null)?.name ?? js.service_verbatim ?? null,
        // A different figure isn't owed until we've agreed it.
        amount_pence: differs ? null : owedPence,
        invoice_name: file.name.slice(0, 200),
      },
    });
    if (mailErr) console.error('[sq] invoice-received email not queued:', mailErr);
  }

  await notifyAdmins(
    `${differs ? 'Invoice differs from the quote' : 'Invoice to pay'}: ${contractor?.business_name ?? 'a contractor'}`,
    [
      `${contractor?.business_name ?? 'A contractor'} has sent their invoice for the job for ${js.contact_name ?? 'a customer'}. ` +
      `Pay it once the customer's balance shows as cleared on /admin/money.`,
      ...(differs
        ? [
            '',
            `It DOESN'T match the quote: invoiced ${formatGBP(amount.invoiced_pence ?? 0)}, quoted ${formatGBP(amount.quoted_pence ?? 0)}.`,
            `Their reason: ${invoiceNote}`,
            `Charge the customer the difference, or pay the quoted amount, from the job page.`,
          ]
        : []),
      '',
      `Open it on the job: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/submissions/${submissionId}`,
    ].join('\n'),
  );

  revalidatePath('/won');
  return {
    ok: true,
    message: differs
      ? `Invoice received, thanks. It comes to ${formatGBP(amount.invoiced_pence ?? 0)} against your quote of ` +
        `${formatGBP(amount.quoted_pence ?? 0)}, so we’ll check the difference with you and the customer ` +
        'before it’s paid.'
      : 'Invoice received, thanks. It’s paid once the customer’s funds have cleared into our account, typically 7 days or less.',
  };
}

/**
 * After a site visit (20260930160000_site_visit_booking): the price the job
 * was booked at stands. The RPC checks the job is theirs and still waiting.
 */
export async function confirmVisitPriceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to update a job.' };
  const submissionId = String(formData.get('submission_id') ?? '');
  if (!submissionId) return { error: 'Something went wrong. Refresh and try again.' };

  const { data, error } = await createServiceRoleClient().rpc('sq_visit_confirm', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
  });
  const res = data as { ok: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    if (error) console.error('[sq] sq_visit_confirm failed:', error.message);
    return { error: res?.reason === 'not_yours' ? 'This job isn’t assigned to your account.' : 'This has already been settled. Refresh to see the job.' };
  }
  revalidatePath('/won');
  return { ok: true, message: 'Price confirmed. We’ve let the customer know.' };
}

/**
 * After a site visit: a different price, and why. The customer accepts it or
 * declines and gets their deposit back; until then the job is paused.
 */
export async function reviseVisitPriceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to update a job.' };
  const submissionId = String(formData.get('submission_id') ?? '');
  const pence = poundsInputToPence(String(formData.get('price') ?? ''));
  const reason = String(formData.get('reason') ?? '').trim();
  if (!submissionId) return { error: 'Something went wrong. Refresh and try again.' };
  if (pence == null || pence <= 0) return { error: 'Enter the new price in pounds, e.g. 450.' };
  if (reason.length < 3) return { error: 'Say what you found that changes the price. The customer will see it.' };
  // The reason goes to the customer after award, so contact details are fine;
  // an off-platform payment arrangement is not.
  const problem = clientNoteProblem(reason);
  if (problem && /paid|payment|cash|transfer|VAT/i.test(problem)) {
    await flagOffPlatform({ text: reason, where: 'message', sender: 'contractor', submissionId, contractorId: user.id });
    return { error: problem };
  }

  const { data, error } = await createServiceRoleClient().rpc('sq_visit_revise', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
    p_contractor_pence: pence,
    p_reason: reason,
  });
  const res = data as { ok: boolean; reason?: string; min_contractor_pence?: number } | null;
  if (error || !res?.ok) {
    if (error) console.error('[sq] sq_visit_revise failed:', error.message);
    switch (res?.reason) {
      case 'below_deposit':
        return {
          error: `That’s less than the customer has already paid. The lowest price you can set here is ${formatGBP(res.min_contractor_pence ?? 0)}. For less than that, get in touch with us.`,
        };
      case 'same_price':
        return { error: 'That’s the price you quoted. Use “Confirm the price” instead.' };
      case 'not_yours':
        return { error: 'This job isn’t assigned to your account.' };
      case 'bad_reason':
        return { error: 'Keep the reason under 1,000 characters.' };
      default:
        return { error: 'This has already been settled. Refresh to see the job.' };
    }
  }
  revalidatePath('/won');
  return { ok: true, message: 'Sent. The customer will accept the new price or decline it. We’ll email you either way.' };
}

/**
 * "Start job" in the app (PRD task 9): the booked job moves to in_progress
 * and the before-and-after photo screen opens. awarded / contacted /
 * scheduled only; anything else is reported, not forced.
 */
export async function startJobAction(formData: FormData): Promise<void> {
  const submissionId = String(formData.get('submission_id') || '');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !submissionId) return;
  const { data, error } = await createServiceRoleClient().rpc('sq_start_job', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
  });
  if (error) console.error('[won] sq_start_job failed:', error.message);
  else if (!(data as { ok: boolean })?.ok) console.warn('[won] sq_start_job refused:', data);
  redirect(`/won/${submissionId}/photos`);
}
