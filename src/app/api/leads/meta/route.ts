import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

/**
 * Meta (Facebook) Lead Ads webhook — the direct integration, no Zapier.
 *
 * GET  — Meta's subscription verification handshake: echo hub.challenge when
 *        hub.verify_token matches META_VERIFY_TOKEN.
 * POST — leadgen change notifications. The payload carries only ids; the lead's
 *        field data is fetched from the Graph API with META_PAGE_ACCESS_TOKEN.
 *        Every request is authenticated by the X-Hub-Signature-256 HMAC
 *        (SHA-256 of the raw body, keyed with META_APP_SECRET).
 *
 * Leads land in the same /admin/leads approval queue as the generic endpoint.
 * Meta retries deliveries, so inserts are deduped on leadgen_id.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const theirs = Buffer.from(header.slice(7), 'hex');
  const ours = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  return theirs.length === ours.length && timingSafeEqual(theirs, ours);
}

type FieldDatum = { name: string; values: string[] };

/** Map Meta's field_data into our lead shape; leftovers become the job hint. */
function mapFields(fieldData: FieldDatum[]) {
  const get = (...names: string[]) => {
    for (const n of names) {
      const f = fieldData.find((d) => d.name.toLowerCase() === n);
      if (f?.values?.[0]) return f.values[0];
    }
    return null;
  };
  const KNOWN = new Set([
    'full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone',
    'post_code', 'postcode', 'zip_code', 'city', 'street_address',
  ]);
  const fullName =
    get('full_name') ??
    [get('first_name'), get('last_name')].filter(Boolean).join(' ').trim();

  // Custom questions ("what do you need doing?", acreage, etc.) → job hint.
  const extras = fieldData
    .filter((d) => !KNOWN.has(d.name.toLowerCase()) && d.values?.[0])
    .map((d) => `${d.name.replace(/_/g, ' ')}: ${d.values.join(', ')}`);

  return {
    full_name: fullName || '(name not provided)',
    phone: get('phone_number', 'phone'),
    email: get('email'),
    postcode: get('post_code', 'postcode', 'zip_code'),
    job_hint: extras.join('\n') || null,
  };
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: 'META_APP_SECRET not set' }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  let body: {
    object?: string;
    entry?: { changes?: { field?: string; value?: { leadgen_id?: string; form_id?: string; page_id?: string } }[] }[];
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (body.object !== 'page') return NextResponse.json({ received: true });

  const admin = createServiceRoleClient();
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  let processed = 0;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;

      // Dedupe — Meta retries webhook deliveries.
      const { data: existing } = await admin
        .from('leads')
        .select('id')
        .eq('details->>leadgen_id', leadgenId)
        .maybeSingle();
      if (existing) continue;

      let mapped: ReturnType<typeof mapFields> | null = null;
      let raw: Json = { leadgen_id: leadgenId, form_id: change.value?.form_id ?? null, page_id: change.value?.page_id ?? null };

      if (pageToken) {
        try {
          const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`);
          const lead = await res.json();
          if (res.ok && Array.isArray(lead.field_data)) {
            mapped = mapFields(lead.field_data as FieldDatum[]);
            raw = { ...(raw as object), field_data: lead.field_data, created_time: lead.created_time ?? null } as Json;
          } else {
            raw = { ...(raw as object), fetch_error: lead.error?.message ?? `HTTP ${res.status}` } as Json;
          }
        } catch (err) {
          raw = { ...(raw as object), fetch_error: (err as Error).message } as Json;
        }
      } else {
        raw = { ...(raw as object), fetch_error: 'META_PAGE_ACCESS_TOKEN not set' } as Json;
      }

      // Insert even when the fetch failed — the leadgen_id is preserved so the
      // lead is recoverable once the token is fixed, and nothing is lost.
      const { data: inserted } = await admin
        .from('leads')
        .insert({
          source: 'facebook',
          full_name: mapped?.full_name ?? '(Facebook lead — fetch failed, see details)',
          phone: mapped?.phone ?? null,
          email: mapped?.email ?? null,
          postcode: mapped?.postcode ?? null,
          job_hint: mapped?.job_hint ?? null,
          details: raw,
        })
        .select('id')
        .single();

      if (inserted) {
        processed++;
        await admin.from('pending_emails').insert({
          kind: 'new_lead',
          to_email: '__admin__',
          payload: { lead_id: inserted.id, full_name: mapped?.full_name ?? 'Facebook lead', job_hint: mapped?.job_hint ?? null },
        });
      }
    }
  }

  // Always 200 — Meta disables webhooks that persistently error.
  return NextResponse.json({ received: true, processed });
}
