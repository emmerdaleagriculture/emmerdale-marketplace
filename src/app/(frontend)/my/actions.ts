'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { claimJobForUser, claimMessage } from '@/lib/customers/claim';
import type { FormState } from '@/lib/form';

/**
 * How a repeat finds its contractor. 'same' offers it to whoever did it last
 * time first (distribute_submission, 48h window); 'market' sends it to every
 * contractor covering the county. Anything unrecognised is the market.
 */
type ContractorMode = 'same' | 'market';
const modeFrom = (formData: FormData): ContractorMode =>
  formData.get('mode') === 'same' ? 'same' : 'market';

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

  const outcome = await claimJobForUser(user.id, user.email, token);
  if (!outcome.ok) {
    if (outcome.reason === 'already_claimed') {
      return { error: 'This job is already on another account.' };
    }
    if (outcome.reason === 'invalid') return { error: 'This link is no longer valid.' };
    return { error: 'That didn’t go through — please try again.' };
  }

  revalidatePath('/my');
  revalidatePath(`/my/${token}`);
  return { ok: true, message: claimMessage(outcome.alsoClaimed) };
}

/** Repeat this job every N months until they stop it — with the same contractor or fresh prices. */
export async function scheduleJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const submissionId = String(formData.get('submission_id') ?? '');
  const months = Number(formData.get('interval_months') ?? 0);
  const mode = modeFrom(formData);
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
  // The contractor comes from the job, never the form.
  const { data: owned } = await admin
    .from('job_submissions')
    .select('id, awarded_contractor_id')
    .eq('id', submissionId)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (!owned) return { error: 'That job isn’t on your account.' };

  const { data: already } = await admin
    .from('job_schedules')
    .select('id')
    .eq('source_submission_id', submissionId)
    .eq('active', true)
    .maybeSingle();
  if (already) return { error: 'This job is already set to repeat.' };

  // Day arithmetic in JS overflows — 31 August plus 6 months is 31 February,
  // which becomes 2 or 3 March — while the SQL side uses make_interval, which
  // clamps. Clamping here keeps the first run consistent with every one after.
  const next = new Date();
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));

  const same = mode === 'same' && Boolean(owned.awarded_contractor_id);
  const { error } = await admin.from('job_schedules').insert({
    customer_id: user.id,
    source_submission_id: submissionId,
    interval_months: months,
    next_run_at: next.toISOString(),
    contractor_mode: same ? 'same' : 'market',
    contractor_id: owned.awarded_contractor_id,
  });
  if (error) {
    console.error('[customer] schedule insert failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }

  revalidatePath('/my');
  return {
    ok: true,
    message: same
      ? `Set. In ${months} months we’ll ask your contractor first, then others if they can’t do it.`
      : `Set. In ${months} months we’ll send it out for fresh prices.`,
  };
}

/** Switch an existing repeat between the same contractor and fresh prices. */
export async function switchScheduleModeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get('schedule_id') ?? '');
  const mode = modeFrom(formData);
  if (!id) return { error: 'Something went wrong — refresh and try again.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to change this.' };

  let query = createServiceRoleClient()
    .from('job_schedules')
    .update({ contractor_mode: mode })
    .eq('id', id)
    .eq('customer_id', user.id)
    .eq('active', true);
  // "The same contractor" needs one on record.
  if (mode === 'same') query = query.not('contractor_id', 'is', null);
  const { data: changed, error } = await query.select('id');
  if (error) return { error: 'That didn’t go through — please try again.' };
  if (!changed || changed.length === 0) {
    return { error: 'That repeat can’t be changed — refresh to see what’s set.' };
  }

  revalidatePath('/my');
  return {
    ok: true,
    message: mode === 'same' ? 'Done — your contractor will be asked first.' : 'Done — it will go out for fresh prices.',
  };
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

  const { data: stopped, error } = await createServiceRoleClient()
    .from('job_schedules')
    .update({ active: false })
    .eq('id', id)
    .eq('customer_id', user.id)
    .select('id');
  if (error) return { error: 'That didn’t go through — please try again.' };
  // Zero rows is not success: a stale page would otherwise say "Stopped" about
  // a schedule that is still running.
  if (!stopped || stopped.length === 0) {
    return { error: 'That repeat is no longer here — refresh to see what’s set.' };
  }

  revalidatePath('/my');
  return { ok: true, message: 'Stopped. Nothing further will go out.' };
}

/**
 * Start a repeat: copy a finished job into a fresh draft, then hand the
 * customer to the confirm step. `mode=same` marks the draft for the contractor
 * who did the job; confirming then offers it to them first.
 *
 * A POST rather than a link, because it writes. Doing this on the page render
 * meant every refresh of the confirm step minted another abandoned draft, and
 * a customer re-reading their own job would quietly fill the table.
 */
export async function startReorderAction(formData: FormData): Promise<void> {
  const sourceId = String(formData.get('submission_id') ?? '');
  const mode = modeFrom(formData);
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
      repeat_of: src.id,
      preferred_contractor_id: mode === 'same' ? src.awarded_contractor_id : null,
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
      urgency: src.urgency,
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

/**
 * Change a reorder draft's mind before it is sent: same contractor ↔ fresh
 * prices. The contractor is always the one who did the job the draft copies.
 */
export async function setDraftModeAction(formData: FormData): Promise<void> {
  const draftId = String(formData.get('draft_id') ?? '');
  const mode = modeFrom(formData);
  if (!draftId) redirect('/my');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/start/again/${draftId}`)}`);

  const admin = createServiceRoleClient();
  const { data: draft } = await admin
    .from('job_submissions')
    .select('id, repeat_of')
    .eq('id', draftId)
    .eq('customer_id', user.id)
    .eq('status', 'draft')
    .maybeSingle();
  if (!draft) redirect('/my');

  let preferred: string | null = null;
  if (mode === 'same' && draft.repeat_of) {
    const { data: prev } = await admin
      .from('job_submissions')
      .select('awarded_contractor_id')
      .eq('id', draft.repeat_of)
      .eq('customer_id', user.id)
      .maybeSingle();
    preferred = prev?.awarded_contractor_id ?? null;
  }

  await admin
    .from('job_submissions')
    .update({ preferred_contractor_id: preferred })
    .eq('id', draft.id)
    .eq('status', 'draft');

  redirect(`/start/again/${draft.id}`);
}
