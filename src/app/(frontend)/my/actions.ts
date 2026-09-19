'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { claimJobForUser, claimMessage } from '@/lib/customers/claim';
import { AREA_UNITS, URGENCY_VALUES } from '@/lib/jobParse/schema';
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
 * While the job is still being priced it can be corrected. Once it is awarded
 * the money has moved, and a quiet change to the spec is not a correction any
 * more — that needs a person, the way cancelling after work starts does.
 */
const EDITABLE_STATUSES = ['confirmed', 'distributed', 'quotes_receiving'];

/** "1.25 acres" / "40 metres" / "not stated" — for the change list in the email. */
function areaLabel(value: number | null, unit: string | null): string {
  if (value === null) return 'not stated';
  return `${value} ${unit === 'linear_m' ? 'metres' : (unit ?? '')}`.trim();
}

/**
 * Correct a job after it has gone out to contractors.
 *
 * The token is the proof, exactly as it is for claiming. The customer this was
 * built for had no account when he needed it — requiring one would have sent
 * him back to email, which is the thing this replaces.
 *
 * A contractor who has already priced KEEPS their price. The area of a small
 * job can move a long way without moving what it costs, because the minimum
 * charge decides it, so withdrawing the quote would throw away a good price to
 * no purpose. They are told instead, and revising is their own choice —
 * submit_contractor_quote already supersedes cleanly when they do.
 */
export async function editJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is no longer valid.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select(
      `id, status, service_verbatim, area_value, area_unit, urgency, target_date,
       access_notes, obstacles, service:services (name), county:counties (name)`,
    )
    .eq('client_token', token)
    .is('client_token_revoked_at', null)
    .maybeSingle();
  if (!js) return { error: 'This link is no longer valid.' };
  if (!EDITABLE_STATUSES.includes(js.status)) {
    return { error: 'This job is already booked — email us and we’ll sort it out.' };
  }

  const description = String(formData.get('service_verbatim') ?? '').trim().slice(0, 2000);
  const areaRaw = String(formData.get('area_value') ?? '').trim();
  const areaValue = areaRaw === '' ? null : Number(areaRaw);
  if (areaValue !== null && (!Number.isFinite(areaValue) || areaValue <= 0)) {
    return { error: 'Give the size as a number, or leave it blank.' };
  }
  const unitRaw = String(formData.get('area_unit') ?? '');
  const areaUnit = (AREA_UNITS as readonly string[]).includes(unitRaw) ? unitRaw : js.area_unit;
  const urgencyRaw = String(formData.get('urgency') ?? '');
  const urgency = (URGENCY_VALUES as readonly string[]).includes(urgencyRaw) ? urgencyRaw : null;
  const dateRaw = String(formData.get('target_date') ?? '');
  const targetDate = urgency === 'dated' && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  const accessNotes = String(formData.get('access_notes') ?? '').trim().slice(0, 1000) || null;
  const obstacles = String(formData.get('obstacles') ?? '').trim().slice(0, 1000) || null;

  // What actually moved. This is the whole content of the contractor's email,
  // so it is built from the before/after rather than from what was submitted:
  // a form that posts every field would otherwise report changes to fields
  // nobody touched.
  const changes: string[] = [];
  if (areaValue !== js.area_value || areaUnit !== js.area_unit) {
    changes.push(`Size: ${areaLabel(js.area_value, js.area_unit)} → ${areaLabel(areaValue, areaUnit)}`);
  }
  if (description && description !== (js.service_verbatim ?? '')) {
    changes.push(`Description: “${description}”`);
  }
  if (urgency !== js.urgency || targetDate !== js.target_date) changes.push('When it needs doing');
  if (accessNotes !== js.access_notes) changes.push('Access notes');
  if (obstacles !== js.obstacles) changes.push('What is in the way');
  if (changes.length === 0) return { ok: true, message: 'Nothing to change — that all matches what we have.' };

  const amendedAt = new Date().toISOString();
  const { data: updated, error } = await admin
    .from('job_submissions')
    .update({
      service_verbatim: description || js.service_verbatim,
      area_value: areaValue,
      area_unit: areaValue === null ? null : areaUnit,
      urgency,
      target_date: targetDate,
      access_notes: accessNotes,
      obstacles,
      amended_at: amendedAt,
    })
    .eq('id', js.id)
    // Re-checked in the write: the status could have moved to awarded between
    // the read above and here, and that is exactly the case that must not slip
    // through.
    .in('status', EDITABLE_STATUSES)
    .select('id');
  if (error || !updated || updated.length === 0) {
    console.error('[amend] update failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }

  await admin.rpc('log_job_event', {
    p_job_id: js.id,
    p_event_type: 'job_amended',
    p_from: null,
    p_to: null,
    p_actor_type: 'client',
    p_actor_id: null,
    p_reason: null,
    p_metadata: { changes },
  });

  // Tell everyone holding a live price. Fire-and-log: a mail failure must not
  // cost the customer their correction, which is already saved above.
  let notified = 0;
  try {
    const [{ data: priced }, { data: live }] = await Promise.all([
      admin
        .from('job_invitations')
        .select('contractor_id, token, contractor:contractors (email)')
        .eq('submission_id', js.id)
        .eq('status', 'priced'),
      admin
        .from('contractor_quotes')
        .select('contractor_id, contractor_price_pence')
        .eq('submission_id', js.id)
        .is('superseded_by', null),
    ]);
    const priceFor = new Map((live ?? []).map((q) => [q.contractor_id, q.contractor_price_pence]));
    const service = (js.service as { name: string } | null)?.name ?? js.service_verbatim;
    const county = (js.county as { name: string } | null)?.name ?? null;

    for (const inv of priced ?? []) {
      const email = (inv.contractor as { email: string | null } | null)?.email;
      if (!email) continue;
      await admin.rpc('sq_notify_once', {
        p_submission_id: js.id,
        // sq_notify_once dedupes on (submission, recipient, kind) — and that is
        // the primary key, so a bare contractor id would let this fire once per
        // job for ever and swallow every correction after the first. Stamping
        // the amendment time into the key keeps the protection against a double
        // send and loses none of the corrections.
        p_recipient: `${inv.contractor_id}:amend:${amendedAt}`,
        p_kind: 'sq_job_amended',
        p_to_email: email,
        p_payload: {
          service,
          county,
          changes,
          token: inv.token,
          current_price_pence: priceFor.get(inv.contractor_id) ?? null,
        },
      });
      notified += 1;
    }
  } catch (err) {
    console.error('[amend] contractor notification failed:', err);
  }

  revalidatePath('/my');
  revalidatePath(`/my/${token}`);
  // Only claim the contractors were told when some actually were: a job
  // corrected before anyone has priced has nobody to tell, and saying
  // otherwise would be a promise about an email that was never sent.
  return {
    ok: true,
    message:
      notified > 0
        ? 'Updated. The contractors who have already priced it have been told — their price still stands unless they choose to change it.'
        : 'Updated. Contractors will see the corrected details when they price it.',
  };
}

/**
 * The other half of having an account: the details themselves.
 *
 * Unlike the claim upsert — which fills gaps and never overwrites, so claiming
 * a second job cannot wipe a name the first one supplied — this writes exactly
 * what the customer typed. They are looking at the field and correcting it, and
 * a merge would quietly refuse the edit.
 *
 * Email is not editable here. It is the identity the account signs in with, so
 * changing it is an auth change, not a detail change.
 */
export async function updateDetailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to change your details.' };

  const name = String(formData.get('contact_name') ?? '').trim().slice(0, 200);
  if (!name) return { error: 'Give us a name to put on your jobs.' };
  // Loose on purpose: landlines, mobiles, spaces, +44 and the odd extension all
  // arrive here, and a strict pattern would reject real numbers to no benefit.
  const phone = String(formData.get('phone') ?? '').trim().slice(0, 40) || null;

  const { error } = await createServiceRoleClient().from('customers').upsert(
    {
      id: user.id,
      // NOT NULL, and the row may genuinely not exist yet: signing up without
      // ever claiming a job never creates one.
      email: user.email ?? '',
      contact_name: name,
      phone,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.error('[customer] details update failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }

  revalidatePath('/my');
  return { ok: true, message: 'Saved.' };
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
