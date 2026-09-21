import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { verifySvixSignature } from '@/lib/webhooks/svix';
import type { Json } from '@/lib/database.types';
import {
  describeDelay,
  isHardBounce,
  isWorthRetrying,
  retryDelayMs,
  type Delivery,
} from '@/lib/email/deliveryRetry';

/**
 * POST /api/email-events — Resend delivery webhook.
 *
 * The queue could only ever say whether Resend accepted a message, which is
 * not the question anyone was asking. A job went out to a customer at a
 * domain that does not exist: the portal link and the first-quote alert were
 * both accepted, both marked `sent`, and both bounced, and the page showed
 * two green rows while the customer waited for a quote that had already
 * arrived. This is the other half of that fact.
 *
 * Subscribe in Resend to the events that say whether a message arrived:
 * email.delivered, email.bounced, email.complained, email.delivery_delayed,
 * email.failed and email.suppressed. Signature secret in
 * RESEND_WEBHOOK_SECRET.
 *
 * email.sent / opened / clicked are acknowledged and ignored — sent is what
 * the queue already knows, and we do not track engagement. email.received is
 * the INBOUND event and belongs to /api/inbound-email; it is ignored here so
 * that pointing it at the wrong endpoint fails quietly rather than eating a
 * contractor's reply.
 */

export const dynamic = 'force-dynamic';

const EVENTS: Record<string, Delivery> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
  // The provider could not send it at all.
  'email.failed': 'failed',
  // Resend refused to try: the address is on its suppression list, which is
  // where addresses land after they have already hard-bounced.
  'email.suppressed': 'suppressed',
};

/** Reached nobody. Everything here is worth a human knowing about. */
const DID_NOT_ARRIVE = new Set<Delivery>(['bounced', 'complained', 'failed', 'suppressed']);

/**
 * The kinds a customer or contractor is actively waiting on.
 *
 * `application_approved` is named explicitly because the prefixes do not
 * reach it, and its absence was the most expensive thing on this page: 12 of
 * the 17 delivery failures in the 30 days to 21 Sep 2026 were approval
 * emails, and not one of them told anybody. A contractor signed up on 11
 * September, was approved the next day, and heard nothing for nine days —
 * the bounce was recorded the whole time and simply never announced.
 *
 * The rule for adding to this list is whether a person is waiting on the
 * other end, not how serious the kind sounds.
 */
const LOUD_KINDS = /^(sq_|customer_|job_|contractor_announcement|application_approved)/;

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    reason?: string;
  };
};

function describe(event: ResendEvent): string {
  const b = event.data?.bounce;
  const parts = [b?.type, b?.subType, b?.message ?? event.data?.reason].filter(Boolean);
  return parts.join(' — ').slice(0, 500) || (event.type ?? 'no detail');
}

/** Postgres unique_violation, surfaced by PostgREST as the error code. */
const DUPLICATE_KEY = '23505';

type FailedRow = {
  id: string;
  kind: string;
  to_email: string;
  payload: Json;
  retry_count: number | null;
};

/**
 * Queue another attempt if this failure was about the moment rather than the
 * address, and describe what will happen — or null if nothing will.
 *
 * Safe to call twice for the same failure. Resend redelivers an event until
 * it gets a 2xx, and a unique index on `retry_of` turns the second insert
 * into a duplicate-key error rather than a second copy of the email.
 *
 * The line is the one Resend already draws. `failed` is the provider saying
 * it could not send at all, which says nothing about the recipient. A
 * Transient bounce is the recipient's server refusing today and inviting us
 * back. Neither is a reason to give up, and both currently mean the message
 * is gone.
 *
 * Everything else is left alone on purpose: `delayed` is Resend still
 * trying, and a second copy from us would arrive alongside its own; a
 * complaint is someone asking us to stop; suppression and a Permanent bounce
 * are the address itself being wrong, which no amount of waiting fixes.
 */
async function maybeRetry(
  admin: ReturnType<typeof createServiceRoleClient>,
  row: FailedRow,
  status: Delivery,
  event: ResendEvent,
): Promise<string | null> {
  if (!isWorthRetrying(status, event.data?.bounce)) return null;

  const attempt = row.retry_count ?? 0;
  const delay = retryDelayMs(attempt);
  if (delay === null) return null;

  const sendAfter = new Date(Date.now() + delay);

  const { error } = await admin.from('pending_emails').insert({
    kind: row.kind,
    to_email: row.to_email,
    payload: row.payload ?? {},
    status: 'pending',
    retry_of: row.id,
    retry_count: attempt + 1,
    send_after: sendAfter.toISOString(),
  });

  // A unique violation means this failure already has its retry: Resend has
  // redelivered an event we have already acted on. That is the index doing
  // its job, not a fault, and must not turn into a second copy of the email
  // or an alarming log line.
  if (error?.code === DUPLICATE_KEY) return 'already queued to go again';

  // Anything else is worth seeing, but not worth failing the webhook over —
  // a non-2xx makes Resend redeliver, and we would re-record the same
  // failure. Say so where it will be read instead.
  if (error) {
    console.error('[email-events] could not queue retry:', error.message);
    return null;
  }

  return `queued to go again ${describeDelay(delay)}`;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET not set' }, { status: 500 });
  }

  const body = await request.text();
  if (!verifySvixSignature(body, request.headers, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const status = EVENTS[event.type ?? ''];
  // Resend sends more event types than we track (sent, opened, clicked).
  // Acknowledge them so it doesn't retry, and record nothing.
  if (!status) return NextResponse.json({ received: true, ignored: event.type });

  const messageId = event.data?.email_id;
  if (!messageId) return NextResponse.json({ received: true, ignored: 'no email_id' });

  const admin = createServiceRoleClient();
  const at = event.created_at ?? new Date().toISOString();
  const detail = describe(event);

  const { data: row } = await admin
    .from('pending_emails')
    .update({ delivery_status: status, delivery_detail: detail, delivery_at: at })
    .eq('provider_message_id', messageId)
    .select('id, kind, to_email, payload, retry_count')
    .maybeSingle();

  // A message we have no row for is not an error: test sends from the Resend
  // dashboard, and anything sent before this webhook existed.
  if (!row) return NextResponse.json({ received: true, matched: false });

  // Suppression is Resend telling us the address is already known bad, which
  // is the same conclusion a hard bounce reaches, one step earlier.
  if (status === 'suppressed' || (status === 'bounced' && isHardBounce(event.data?.bounce))) {
    await admin.rpc('record_undeliverable_email', {
      p_email: row.to_email,
      p_kind: row.kind,
      p_detail: detail,
    });
  }

  // A failure the sender caused, not the address: try again later.
  //
  // The queue's own retries cover a send Resend refuses. This covers the
  // other case — accepted, then reported as never arriving — which until now
  // ended the message's life, because the worker only ever looks at rows
  // still marked 'pending' and this one is marked 'sent'.
  //
  // A new row rather than a reset, so the failure keeps its record. The
  // worker re-checks undeliverable_emails before every send, so an address
  // that hard-bounces in the meantime is caught there and never written to,
  // whatever this decides.
  const retried = await maybeRetry(admin, row, status, event);

  // Someone has to be told. A bounced invitation is a contractor who never
  // saw the job; a bounced quote alert is a customer who thinks we forgot.
  //
  // A retry in hand changes what the alert should say but not whether to
  // send one: a full mailbox that we will try again at teatime is still
  // something an admin should know is happening.
  if (DID_NOT_ARRIVE.has(status) && LOUD_KINDS.test(row.kind)) {
    const consequence =
      status === 'complained'
        ? 'They marked it as spam. Do not send to this address again without asking.'
        : status === 'suppressed'
          ? 'Resend would not send to this address — it is on the suppression list from an earlier failure. It needs clearing there before anything else will reach them.'
          : retried
            ? `They did not receive it. This looks temporary, so it is ${retried} — no action needed unless that one fails too.`
            : 'They did not receive it. If this is a customer mid-job, they need contacting another way.';
    await notifyAdmins(
      `Email ${status}: ${row.kind}`,
      [`${row.kind} to ${row.to_email} was ${status}.`, detail, '', consequence].join('\n'),
    );
  }

  return NextResponse.json({ received: true, matched: true, status });
}
