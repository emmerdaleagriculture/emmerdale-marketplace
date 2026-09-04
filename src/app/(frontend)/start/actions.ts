'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { normalisePostcode, resolveCounty, type CountyResolution } from '@/lib/postcodes';
import { getCounties, getServices } from '@/lib/reference';
import { verifyTurnstile } from '@/lib/turnstile';
import type { FormState } from '@/lib/form';
import { CONFIRM_SUCCESS } from './copy';
import type { Json } from '@/lib/database.types';
import { deterministicParse, toAcres } from '@/lib/jobParse/deterministic';
import { reconcile } from '@/lib/jobParse/reconcile';
import { parseBoundary, ringAreaAcres } from '@/lib/jobParse/geometry';
import { conditionAnswers } from '@/lib/jobParse/conditions';
import { GATE_WIDTH_VALUES, gateWidthLabel, normaliseW3w } from '@/lib/jobParse/access';
import {
  clientIp,
  logParseEvent,
  rateLimited,
  CONFIRM_LIMIT_PER_HOUR,
  PARSE_LIMIT_PER_HOUR,
} from '@/lib/jobParse/limits';
import { AREA_UNITS, URGENCY_VALUES, type ParseResult } from '@/lib/jobParse/schema';

export type ParseValues = { raw_text: string; location_raw: string };
export type ParseActionState = FormState & { result?: ParseResult; values?: ParseValues };
export type ConfirmActionState = FormState;

/** Loose British Isles bounding box — sanity check on client-supplied coords. */
function inBritishIsles(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 49 && lat <= 61.5 && lng >= -11 && lng <= 2.5;
}

const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Store step-1 photos (spec §26a.3) in the private job-photos bucket. Never
 * parsed, never blocking — a failed upload just means no photo on the record.
 */
async function storePhotos(
  admin: ReturnType<typeof createServiceRoleClient>,
  submissionId: string,
  formData: FormData,
): Promise<string[]> {
  const paths: string[] = [];
  for (const [field, label] of [
    ['photo_field', 'field'],
    ['photo_access', 'access'],
  ] as const) {
    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > PHOTO_MAX_BYTES) {
      console.warn(`[jobParse] ${field} over size limit (${file.size}b) — skipped`);
      continue;
    }
    const ext = PHOTO_TYPES[file.type];
    if (!ext) continue;
    const path = `${submissionId}/${label}.${ext}`;
    try {
      const { error } = await admin.storage
        .from('job-photos')
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type,
          upsert: true,
        });
      if (error) {
        console.error(`[jobParse] photo upload failed (${path}):`, error.message);
      } else {
        paths.push(path);
      }
    } catch (err) {
      console.error(`[jobParse] photo upload failed (${path}):`, err);
    }
  }
  return paths;
}

const ParseSchema = z.object({
  raw_text: z
    .string()
    .trim()
    .min(10, 'Tell us a little more about the job — a sentence or two is plenty.')
    .max(2000, 'That’s a bit long — please keep it under 2,000 characters.'),
  location_raw: z.string().trim().max(200).optional().or(z.literal('')),
});

/**
 * Landing view beacon — one row per pageview, fired from the client after
 * hydration so it counts the humans ads bill for. Fire-and-forget: never
 * throws, never blocks anything.
 */
export async function recordLandingView(data: {
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  gclid?: string;
}): Promise<void> {
  try {
    const clean = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null;
    const admin = createServiceRoleClient();
    await admin.from('landing_views').insert({
      ip: await clientIp(),
      referrer: clean(data.referrer),
      utm_source: clean(data.utm_source),
      utm_medium: clean(data.utm_medium),
      utm_campaign: clean(data.utm_campaign),
      gclid: clean(data.gclid),
    });
  } catch (err) {
    console.error('[jobParse] landing view insert failed:', err);
  }
}

/**
 * Step 1 → 3: parse the customer's free text into an editable job spec.
 * Two layers, one request: deterministic extraction pulls anything with a
 * hard format (postcode, quantities, explicit dates, phone, email) and the
 * geocode settles location. Everything it can't read with certainty is left
 * blank for the customer to fill in on the confirm step, which they see and
 * correct either way. The page never dead-ends — a failed parse on a paid
 * click is a wasted click.
 *
 * There is deliberately no model here. Job routing is by county alone
 * (20260904180000), so nothing downstream depends on interpreting the
 * wording; contractors read the customer's own words.
 */
export async function parseJobAction(
  _prev: ParseActionState,
  formData: FormData,
): Promise<ParseActionState> {
  const values: ParseValues = {
    raw_text: String(formData.get('raw_text') ?? ''),
    location_raw: String(formData.get('location_raw') ?? ''),
  };

  const parsed = ParseSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.', values };
  }
  const d = parsed.data;
  const locationRaw = d.location_raw ?? '';
  const ip = await clientIp();

  // Bot traps (honeypot + minimum fill time, as on the enquiry form). A
  // trapped submission still gets a working flow rather than being faked
  // away, so a false-positive human is never dead-ended; the trap is now
  // recorded for signal rather than to protect a per-call spend.
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  const botSuspect = Boolean(honeypot) || (renderedAt > 0 && Date.now() - renderedAt < 3000);

  if (!botSuspect) {
    const token = String(formData.get('cf-turnstile-response') || '');
    const turnstile = await verifyTurnstile(token, ip);
    if (!turnstile.ok) {
      await logParseEvent(ip, 'parse', 'rejected', `turnstile:${turnstile.error}`);
      return {
        error: 'We couldn’t verify you’re human just then — please try again.',
        values,
      };
    }
  }

  if (await rateLimited(ip, 'parse', PARSE_LIMIT_PER_HOUR)) {
    await logParseEvent(ip, 'parse', 'rejected', 'rate_limit');
    return {
      error: 'You’ve sent a few of these in a row — give it a little while and try again.',
      values,
    };
  }

  const now = new Date();
  const det = deterministicParse(d.raw_text, locationRaw, now);

  // Geocode → county/lat/lng. Never blocks; an unresolvable location just
  // stores nothing and the confirm step asks for a postcode.
  const postcodeCandidate = det.postcode_full ?? det.postcode_outcode;

  // The geocode, the reference list and the draft row need nothing from each
  // other, and every one of them is a round trip. Started together they cost
  // the slowest, not the sum — which matters most on the step the customer is
  // sitting and waiting through.
  const geoPromise: Promise<CountyResolution | null> = postcodeCandidate
    ? resolveCounty(postcodeCandidate)
    : Promise.resolve(null);
  const servicesPromise = getServices();

  const admin = createServiceRoleClient();
  const draftPromise = admin
    .from('job_submissions')
    .insert({
      raw_text: d.raw_text,
      location_raw: locationRaw || null,
      utm_source: String(formData.get('utm_source') || '') || null,
      utm_medium: String(formData.get('utm_medium') || '') || null,
      utm_campaign: String(formData.get('utm_campaign') || '') || null,
      gclid: String(formData.get('gclid') || '') || null,
    })
    .select('id')
    .single();

  const [geo, { data: draft, error: draftError }] = await Promise.all([
    geoPromise,
    draftPromise,
  ]);
  if (draftError || !draft) {
    console.error('[jobParse] draft insert failed:', draftError);
    return { error: 'Something went wrong — please try again.', values };
  }

  // Photos (§26a.3) — stored, never parsed, never blocking.
  const photoPaths = await storePhotos(admin, draft.id, formData);

  // No model in job creation: the deterministic layer is the whole parse.
  // It already pulls anything with a hard format — postcode, quantities,
  // explicit dates, phone, email — and the customer reviews and corrects
  // every field on the confirm step. reconcile() has always supported a null
  // model result (bot traps and budget caps took this path), so this is the
  // existing, tested branch rather than a new one.
  const merged = reconcile(det, null, geo);

  // The customer's own words ARE the job description now. Without a model
  // there is nothing to summarise them into, and service_verbatim is what the
  // contractor actually reads on the quote page — so carry step 1's text
  // through rather than showing an empty box and asking for it twice.
  if (!merged.service_verbatim) merged.service_verbatim = d.raw_text;

  // A postcode that straddles a border (SO51 is Hampshire and Wiltshire) or is
  // only an outcode resolves to no county at all. That used to confirm a job
  // with county_id null, which matches no contractor and tells the customer
  // "nobody covers your area" — untrue, and invisible. Offer the choice
  // instead: the candidates when we know them, every county when we don't.
  if (merged.county_id === null) {
    if (merged.county_candidates.length > 0) {
      merged.county_choice_reason = 'border';
    } else {
      // Finding 14: an unnarrowed list of every county is read, not scanned.
      merged.county_candidates = (await getCounties())
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      merged.county_choice_reason = 'unplaced';
    }
  }

  // "Use my location" fallback: when no postcode geocoded, the browser's own
  // coordinates still pin the map on the confirm step.
  const geoLat = Number(formData.get('geo_lat'));
  const geoLng = Number(formData.get('geo_lng'));
  if (merged.lat === null && inBritishIsles(geoLat, geoLng)) {
    merged.lat = geoLat;
    merged.lng = geoLng;
  }

  // Resolve the canonical name to a service id by name, so a reseed with
  // different ids can't mis-tag submissions (same rule as leadServiceIds).
  const services = await servicesPromise;
  const serviceId = merged.service
    ? (services.find((s) => s.name === merged.service)?.id ?? null)
    : null;
  if (merged.service && serviceId === null) {
    console.error(`[jobParse] canonical service "${merged.service}" not found in services table`);
  }

  const { error: updateError } = await admin
    .from('job_submissions')
    .update({
      service_id: serviceId,
      service_verbatim: merged.service_verbatim || null,
      service_alternatives: merged.service_alternatives,
      area_value: merged.area_value,
      area_unit: merged.area_unit,
      postcode: merged.postcode,
      lat: merged.lat,
      lng: merged.lng,
      county_id: merged.county_id,
      urgency: merged.urgency,
      target_date: merged.target_date,
      access_notes: merged.access_notes || null,
      obstacles: merged.obstacles || null,
      service_attributes: merged.service_attributes,
      parse_confidence: merged.parse_confidence,
      missing_fields: merged.missing_fields,
      model_version: null,
      prompt_version: null,
      parsed_at: new Date().toISOString(),
      parse_source: merged.parse_source,
      photo_paths: photoPaths,
    })
    .eq('id', draft.id);
  if (updateError) console.error('[jobParse] draft update failed:', updateError);

  // Immutable parse log — the eval corpus (§5.1). Insert-only, never pruned.
  const { error: logError } = await admin.from('job_submission_parses').insert({
    submission_id: draft.id,
    model_output: null,
    deterministic_output: det,
    parse_source: merged.parse_source,
    model_version: null,
    prompt_version: null,
    error: botSuspect ? 'skipped:bot_suspect' : null,
    latency_ms: null,
  });
  if (logError) console.error('[jobParse] parse log insert failed:', logError);

  await logParseEvent(
    ip,
    'parse',
    botSuspect ? 'rejected' : 'ok',
    botSuspect ? 'honeypot' : undefined,
  );

  return {
    ok: true,
    values,
    result: { submission_id: draft.id, ...merged },
  };
}

const ConfirmSchema = z.object({
  submission_id: z.string().uuid(),
  contact_name: z.string().trim().min(1, 'Your name is required.'),
  contact_phone: z.string().trim().min(5, 'A phone number is required.'),
  // Required: everything we send the customer after this goes by email.
  contact_email: z.string().trim().email('An email address is required.'),
  contact_preference: z.enum(['phone', 'email', 'either']).default('either'),
  county_id: z.coerce.number().int().positive().optional().or(z.literal('')),
  service_choice: z.string().trim(),
  service_confirmed: z.enum(['yes', 'no']),
  service_other_text: z.string().trim().max(300).optional().or(z.literal('')),
  area_value: z.coerce.number().positive().optional().or(z.literal('')),
  area_unit: z.enum(AREA_UNITS).optional().or(z.literal('')),
  postcode: z.string().trim().max(10).optional().or(z.literal('')),
  urgency: z.enum(URGENCY_VALUES).optional().or(z.literal('')),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  access_notes: z.string().trim().max(1000).optional().or(z.literal('')),
  obstacles: z.string().trim().max(1000).optional().or(z.literal('')),
});


/**
 * Step 4: attach contact details and confirm the record. Only ever updates an
 * existing draft by its unguessable id (minted by a Turnstile-verified
 * parse), and the status='draft' guard makes a double submit idempotent.
 * A declined or unmatched classification never blocks confirmation.
 */
export async function confirmJobAction(
  _prev: ConfirmActionState,
  formData: FormData,
): Promise<ConfirmActionState> {
  const ip = await clientIp();
  if (await rateLimited(ip, 'confirm', CONFIRM_LIMIT_PER_HOUR)) {
    await logParseEvent(ip, 'confirm', 'rejected', 'rate_limit');
    return { error: 'Too many attempts — give it a little while and try again.' };
  }

  const parsed = ConfirmSchema.safeParse({
    submission_id: formData.get('submission_id'),
    contact_name: formData.get('contact_name'),
    contact_phone: formData.get('contact_phone'),
    contact_email: formData.get('contact_email'),
    contact_preference: formData.get('contact_preference') || 'either',
    county_id: formData.get('county_id') || '',
    service_choice: formData.get('service_choice'),
    service_confirmed: formData.get('service_confirmed'),
    // Only rendered when "something else" is open — absent means null, and
    // null fails z.string().optional() (that accepts only undefined).
    service_other_text: formData.get('service_other_text') ?? '',
    area_value: formData.get('area_value') || '',
    area_unit: formData.get('area_unit') || '',
    postcode: formData.get('postcode') || '',
    urgency: formData.get('urgency') || '',
    target_date: formData.get('target_date') || '',
    access_notes: formData.get('access_notes') ?? '',
    obstacles: formData.get('obstacles') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  const admin = createServiceRoleClient();
  const { data: draft } = await admin
    .from('job_submissions')
    .select('id, status, postcode, county_id, lat, lng, service_verbatim, service_attributes, raw_text, parse_source, utm_source, utm_campaign, gclid')
    .eq('id', d.submission_id)
    .maybeSingle();
  if (!draft) return { error: 'We couldn’t find your submission — please start again.' };
  // Double submit (back button, double tap) — already done, don't error.
  if (draft.status === 'confirmed') return { ok: true, message: CONFIRM_SUCCESS };
  if (draft.status !== 'draft') {
    return { error: 'This submission has expired — please start again.' };
  }

  // Service: canonical name resolved to an id by name at write time; 'other'
  // or an unresolvable name stores null (⇔ unmatched) with the customer's own
  // words kept — capture always wins over taxonomy (spec §4 step 3).
  let serviceId: number | null = null;
  let serviceName: string | null = null;
  if (d.service_choice && d.service_choice !== 'other') {
    const services = await getServices();
    const match = services.find((s) => s.name === d.service_choice);
    if (match) {
      serviceId = match.id;
      serviceName = match.name;
    } else {
      console.warn(`[jobParse] confirm sent unknown service "${d.service_choice}" — storing as unmatched`);
    }
  }
  const serviceVerbatim =
    (d.service_choice === 'other' && d.service_other_text) || draft.service_verbatim || null;

  // Location: re-resolve only when the customer edited the postcode — the
  // parse-time resolution is otherwise kept (resolve once, never recompute).
  let postcode = draft.postcode;
  let countyId = draft.county_id;
  let countyName: string | null = null;
  let lat = draft.lat;
  let lng = draft.lng;
  const editedPostcode = d.postcode?.trim() ?? '';
  if (editedPostcode && editedPostcode.toUpperCase() !== (draft.postcode ?? '').toUpperCase()) {
    const geo = await resolveCounty(editedPostcode);
    // Store the canonical spaced form: the pre-award district redaction is
    // split_part(postcode, ' ', 1), so an unspaced "SO249AA" would leak the
    // FULL postcode to every invited contractor.
    const norm = normalisePostcode(editedPostcode);
    postcode = norm.full ?? norm.outcode ?? editedPostcode.toUpperCase().slice(0, 4);
    // Keep the county we already had when the edit doesn't resolve. Nulling it
    // here is the same dead job this flow exists to prevent — matches nobody,
    // tells the customer nobody covers them — and the confirm step shows no
    // county picker in this path, because at parse time there was nothing to
    // pick. A slightly stale county beats a job that can never be seen.
    countyId = geo.county_id ?? countyId;
    countyName = geo.county_name ?? null;
    lat = geo.lat ?? null;
    lng = geo.lng ?? null;
  }
  // The customer's own pick, offered when the postcode couldn't settle it.
  // Only ever fills a gap: a resolved county is never overridden by the form.
  if (!countyId && typeof d.county_id === 'number') {
    const { data: picked } = await admin
      .from('counties')
      .select('id, name')
      .eq('id', d.county_id)
      .maybeSingle();
    if (picked) {
      countyId = picked.id;
      countyName = picked.name;
    }
  }

  // The kept parse-time county arrives as an id only — name it for the email.
  if (countyId && !countyName) {
    const { data: county } = await admin
      .from('counties')
      .select('name')
      .eq('id', countyId)
      .maybeSingle();
    countyName = county?.name ?? null;
  }

  // Pin refinement (§7): a dragged pin is more precise than a postcode
  // centroid, so it wins for coordinates. Sanity-boxed — never trusted blind.
  const pinLat = Number(formData.get('lat'));
  const pinLng = Number(formData.get('lng'));
  if (inBritishIsles(pinLat, pinLng)) {
    lat = pinLat;
    lng = pinLng;
  }

  // Boundary (§7): validate the polygon and recompute its area server-side —
  // the client's live figure is display only. Stored even when the customer
  // keeps their stated figure; downstream needs both.
  const boundary = parseBoundary(formData.get('boundary'));
  const areaMapped = boundary
    ? Number(ringAreaAcres(boundary.coordinates[0]).toFixed(2))
    : null;

  // Gate / access details — optional, and lenient: a typo'd what3words or an
  // unknown width value stores null rather than blocking the submit.
  const gateW3w = normaliseW3w(formData.get('gate_w3w'));
  const gateWidthRaw = String(formData.get('gate_width') || '');
  const gateWidth = GATE_WIDTH_VALUES.includes(gateWidthRaw as never) ? gateWidthRaw : null;

  // Area normalisation (acres for areas, linear metres for lengths), same
  // rule as the parse pipeline.
  let areaValue: number | null = typeof d.area_value === 'number' ? d.area_value : null;
  let areaUnit: string | null = d.area_unit || null;
  if (areaValue !== null && areaUnit && areaUnit !== 'linear_m' && areaUnit !== 'acres') {
    const acres = toAcres(areaValue, areaUnit as (typeof AREA_UNITS)[number]);
    if (acres !== null) {
      areaValue = Number(acres.toFixed(2));
      areaUnit = 'acres';
    }
  }

  // Downstream must know whether it holds a stated figure or a measurement (§7).
  const areaSource =
    areaMapped !== null && areaValue !== null ? 'both' : areaMapped !== null ? 'mapped' : 'stated';

  // Condition answers (§26a.2) merge into the parse-time attributes.
  const conditions = conditionAnswers(serviceName, (n) => formData.get(n));
  const serviceAttributes = {
    ...((draft.service_attributes as Record<string, unknown>) ?? {}),
    ...conditions,
  };

  const { data: updated, error } = await admin
    .from('job_submissions')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      contact_name: d.contact_name,
      contact_phone: d.contact_phone,
      contact_email: d.contact_email,
      contact_preference: d.contact_preference,
      service_id: serviceId,
      service_confirmed: d.service_confirmed === 'yes',
      service_verbatim: serviceVerbatim,
      area_value: areaValue,
      area_unit: areaValue !== null ? areaUnit : null,
      area_mapped_value: areaMapped,
      area_source: areaSource,
      boundary: boundary as unknown as Json,
      service_attributes: serviceAttributes as Json,
      postcode,
      county_id: countyId,
      lat,
      lng,
      urgency: d.urgency || null,
      target_date: d.target_date || null,
      access_notes: d.access_notes || null,
      obstacles: d.obstacles || null,
      gate_w3w: gateW3w,
      gate_width: gateWidth,
    })
    .eq('id', d.submission_id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    if (!error) return { ok: true, message: CONFIRM_SUCCESS }; // raced with itself — already confirmed
    console.error('[jobParse] confirm update failed:', error);
    return { error: 'Something went wrong saving your details — please try again.' };
  }

  await logParseEvent(ip, 'confirm', 'ok');

  // Part 2: fan the confirmed job out to matching contractors. Fire-and-log —
  // a distribution hiccup must never break the customer's confirmation, and
  // the 5-minute sweep backstop redistributes anything left behind.
  try {
    const { data: dist, error: distError } = await admin.rpc('distribute_submission', {
      p_submission_id: d.submission_id,
    });
    if (distError) console.error('[sq] distribution failed:', distError);
    else console.log('[sq] distributed:', JSON.stringify(dist));
  } catch (err) {
    console.error('[sq] distribution failed:', err);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    serviceName
      ? `New job submission: ${serviceName}`
      : 'New job submission: UNMATCHED — review taxonomy',
    `A customer has described a job on the ads landing page.\n\n` +
      `Service:    ${serviceName ?? `(unmatched — their words: “${serviceVerbatim ?? '—'}”)`}\n` +
      `Confirmed:  ${d.service_confirmed === 'yes' ? 'accepted our classification' : 'picked/typed their own'}\n` +
      `In their words: ${serviceVerbatim ?? '—'}\n` +
      `Area:       ${areaValue !== null ? `${areaValue} ${areaUnit}` : '—'}${areaMapped !== null ? ` (drawn boundary: ${areaMapped} acres)` : ''}\n` +
      `Postcode:   ${postcode ?? '—'}\n` +
      `County:     ${countyName ?? (countyId ? `#${countyId}` : '(not resolved)')}\n` +
      `Urgency:    ${d.urgency || '—'}${d.target_date ? ` (target ${d.target_date})` : ''}\n` +
      `Gate:       ${gateWidthLabel(gateWidth) ?? '—'}${gateW3w ? ` · ///${gateW3w}` : ''}\n` +
      `Contact:    ${d.contact_name} · ${d.contact_phone}${d.contact_email ? ` · ${d.contact_email}` : ''} (prefers ${d.contact_preference})\n` +
      `Parse:      ${draft.parse_source ?? '—'}\n` +
      `Attribution: ${[draft.utm_source, draft.utm_campaign, draft.gclid ? 'gclid' : null].filter(Boolean).join(' / ') || '—'}\n\n` +
      `Full text:\n${draft.raw_text}\n\n` +
      `Submission id: ${d.submission_id} (${siteUrl})`,
  );

  return { ok: true, message: CONFIRM_SUCCESS };
}
