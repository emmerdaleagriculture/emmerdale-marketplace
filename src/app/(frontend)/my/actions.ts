'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import type { FormState } from '@/lib/form';

/**
 * Turn a job link into an account.
 *
 * The token is the proof. Signing up cannot be trusted to prove an email
 * address on this project (auth runs with autoconfirm on), so the claim is
 * anchored to something the customer demonstrably holds: the link that was
 * emailed to them. Everything else follows from that one fact.
 */
export async function claimJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is no longer valid.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/my/${token}`)}`);

  const admin = createServiceRoleClient();

  // The customer row is created on first claim rather than at signup: an
  // account only becomes a customer account when a job is attached to it.
  const { data: js } = await admin
    .from('job_submissions')
    .select('contact_name, contact_phone, contact_email')
    .eq('client_token', token)
    .maybeSingle();

  await admin.from('customers').upsert(
    {
      id: user.id,
      email: user.email ?? js?.contact_email ?? '',
      contact_name: js?.contact_name ?? null,
      phone: js?.contact_phone ?? null,
    },
    { onConflict: 'id' },
  );

  const { data, error } = await admin.rpc('claim_submission_for_customer', {
    p_token: token,
    p_customer_id: user.id,
  });
  if (error) {
    console.error('[customer] claim failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string; also_claimed?: number };
  if (!res.ok) {
    if (res.reason === 'already_claimed') {
      return { error: 'This job is already on another account.' };
    }
    return { error: 'This link is no longer valid.' };
  }

  revalidatePath('/my');
  revalidatePath(`/my/${token}`);
  const also = res.also_claimed ?? 0;
  return {
    ok: true,
    message:
      also > 0
        ? `Saved. ${also} earlier job${also === 1 ? '' : 's'} at this address came with it.`
        : 'Saved to your account.',
  };
}

/** Repeat this job every N months until they stop it. */
export async function scheduleJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const submissionId = String(formData.get('submission_id') ?? '');
  const months = Number(formData.get('interval_months') ?? 0);
  if (!submissionId || !Number.isInteger(months) || months < 1 || months > 24) {
    return { error: 'Choose how often the job should repeat.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to set this up.' };

  const admin = createServiceRoleClient();
  // Ownership is checked here rather than trusted from the form: the id comes
  // from a page the customer was shown, which is not the same as a right to it.
  const { data: owned } = await admin
    .from('job_submissions')
    .select('id')
    .eq('id', submissionId)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (!owned) return { error: 'That job isn’t on your account.' };

  const next = new Date();
  next.setMonth(next.getMonth() + months);

  const { error } = await admin.from('job_schedules').insert({
    customer_id: user.id,
    source_submission_id: submissionId,
    interval_months: months,
    next_run_at: next.toISOString(),
  });
  if (error) {
    console.error('[customer] schedule insert failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }

  revalidatePath('/my');
  return { ok: true, message: `Set. We’ll send it out again in ${months} months.` };
}

/** Stop a repeat. Kept, not deleted, so the history still reads. */
export async function cancelScheduleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get('schedule_id') ?? '');
  if (!id) return { error: 'Something went wrong — refresh and try again.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to change this.' };

  const { error } = await createServiceRoleClient()
    .from('job_schedules')
    .update({ active: false })
    .eq('id', id)
    .eq('customer_id', user.id);
  if (error) return { error: 'That didn’t go through — please try again.' };

  revalidatePath('/my');
  return { ok: true, message: 'Stopped. Nothing further will go out.' };
}

/**
 * Start a repeat: copy a finished job into a fresh draft, then hand the
 * customer to the confirm step.
 *
 * A POST rather than a link, because it writes. Doing this on the page render
 * meant every refresh of the confirm step minted another abandoned draft, and
 * a customer re-reading their own job would quietly fill the table.
 */
export async function startReorderAction(formData: FormData): Promise<void> {
  const sourceId = String(formData.get('submission_id') ?? '');
  if (!sourceId) redirect('/my');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/my')}`);

  const admin = createServiceRoleClient();
  const { data: src } = await admin
    .from('job_submissions')
    .select('*')
    .eq('id', sourceId)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (!src) redirect('/my');

  const { data: draft, error } = await admin
    .from('job_submissions')
    .insert({
      customer_id: user.id,
      raw_text: src.raw_text,
      location_raw: src.location_raw,
      service_id: src.service_id,
      service_verbatim: src.service_verbatim,
      area_value: src.area_value,
      area_unit: src.area_unit,
      area_source: src.area_source,
      area_mapped_value: src.area_mapped_value,
      boundary: src.boundary,
      postcode: src.postcode,
      lat: src.lat,
      lng: src.lng,
      county_id: src.county_id,
      access_notes: src.access_notes,
      obstacles: src.obstacles,
      service_attributes: src.service_attributes,
      gate_w3w: src.gate_w3w,
      gate_width: src.gate_width,
      photo_paths: src.photo_paths,
    })
    .select('id')
    .single();
  if (error || !draft) {
    console.error('[reorder] draft insert failed:', error);
    redirect('/my');
  }

  redirect(`/start/again/${draft.id}`);
}
