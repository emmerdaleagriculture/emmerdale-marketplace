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

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = body[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  const fullName = pick('full_name', 'name', 'fullName');
  if (!fullName) {
    return NextResponse.json({ ok: false, error: 'missing name' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      source: pick('source') ?? 'facebook',
      full_name: fullName,
      phone: pick('phone', 'phone_number', 'phoneNumber'),
      email: pick('email', 'email_address'),
      postcode: pick('postcode', 'post_code', 'postal_code', 'zip', 'zip_code'),
      job_hint: pick('job', 'job_hint', 'message', 'description', 'details', 'what_do_you_need'),
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
    payload: { lead_id: lead.id, full_name: fullName, job_hint: pick('job', 'job_hint', 'message', 'description') },
  });

  return NextResponse.json({ ok: true, id: lead.id });
}
