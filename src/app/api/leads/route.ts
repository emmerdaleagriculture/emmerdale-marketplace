import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

/**
 * POST /api/leads — intake for Facebook Lead Ads (via Zapier/Make/Meta webhook,
 * or anything else that can POST JSON).
 *
 * Auth: `x-webhook-secret` header (or `Authorization: Bearer …`) must equal
 * LEADS_WEBHOOK_SECRET.
 *
 * Field names are mapped loosely so common FB/Zapier exports work unmodified:
 *   name:      full_name | name | fullName
 *   phone:     phone | phone_number | phoneNumber
 *   email:     email | email_address
 *   postcode:  postcode | post_code | postal_code | zip | zip_code
 *   job:       job | job_hint | message | description | details | what_do_you_need
 * The complete raw payload is stored in leads.details for audit either way.
 *
 * Leads land in the /admin/leads approval queue; nothing is published
 * automatically.
 */
export async function POST(request: Request) {
  const secret = process.env.LEADS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'LEADS_WEBHOOK_SECRET not set' }, { status: 500 });
  }
  const given =
    request.headers.get('x-webhook-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (given !== secret) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  // Facebook Lead Ads nests the answers in a `field_data` array of
  // { name, values }. If present (e.g. mapped straight from Make's "Field data"
  // collection), flatten it so custom questions become top-level fields.
  const fd = body.field_data;
  if (Array.isArray(fd)) {
    // Graph API shape: [{ name, values: [...] }]
    for (const item of fd) {
      const name = (item?.name ?? '').toString().trim();
      const value = Array.isArray(item?.values) ? item.values[0] : item?.values;
      if (name && value != null && body[name] === undefined) body[name] = value;
    }
  } else if (fd && typeof fd === 'object') {
    // Make shape: { field_name: value | [value] }
    for (const [name, raw] of Object.entries(fd as Record<string, unknown>)) {
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (name && value != null && body[name] === undefined) {
        body[name] = typeof value === 'string' || typeof value === 'number' ? value : String(value);
      }
    }
  }

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      // case-insensitive, space/underscore-insensitive key match
      const found = Object.keys(body).find(
        (bk) => bk.toLowerCase().replace(/\s+/g, '_') === k,
      );
      const v = found ? body[found] : undefined;
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return null;
  };

  // Never drop a lead over an imperfect mapping — the full raw payload is always
  // kept in details, so a name-less lead still lands and can be fixed at publish.
  const fullName =
    pick('full_name', 'name', 'fullname') ||
    [pick('first_name'), pick('last_name')].filter(Boolean).join(' ').trim() ||
    'Facebook lead (name not mapped)';

  // Fold any unrecognised fields (custom form questions like "acreage",
  // "what do you need?") into the job hint so nothing is lost.
  const KNOWN = new Set([
    'source', 'field_data', 'full_name', 'name', 'fullname', 'first_name', 'last_name',
    'email', 'email_address', 'phone', 'phone_number', 'postcode', 'post_code',
    'postal_code', 'zip', 'zip_code', 'city', 'street_address', 'id', 'created_time',
    'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
    'form_id', 'form_name', 'is_organic', 'platform',
    'job', 'job_hint', 'message', 'description', 'details', 'what_do_you_need',
  ]);
  const explicitHint = pick('job', 'job_hint', 'message', 'description', 'what_do_you_need');
  const extras = Object.entries(body)
    .filter(([k, v]) => {
      const nk = k.toLowerCase().replace(/\s+/g, '_');
      return !KNOWN.has(nk) && (typeof v === 'string' || typeof v === 'number') && String(v).trim();
    })
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
  const jobHint = [explicitHint, ...extras].filter(Boolean).join('\n') || null;

  const admin = createServiceRoleClient();
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      source: pick('source') ?? 'facebook',
      full_name: fullName,
      phone: pick('phone', 'phone_number'),
      email: pick('email', 'email_address'),
      postcode: pick('postcode', 'post_code', 'postal_code', 'zip', 'zip_code'),
      job_hint: jobHint,
      details: body as Json,
    })
    .select('id')
    .single();

  if (error || !lead) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  // Nudge admin — drained by the send-emails function.
  await admin.from('pending_emails').insert({
    kind: 'new_lead',
    to_email: '__admin__',
    payload: { lead_id: lead.id, full_name: fullName, job_hint: jobHint },
  });

  return NextResponse.json({ ok: true, id: lead.id });
}
