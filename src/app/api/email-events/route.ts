import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { verifySvixSignature } from '@/lib/webhooks/svix';

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
 * Subscribe in Resend to: email.delivered, email.bounced, email.complained,
 * email.delivery_delayed. Signature secret in RESEND_WEBHOOK_SECRET.
 */

export const dynamic = 'force-dynamic';

const EVENTS: Record<string, 'delivered' | 'bounced' | 'complained' | 'delayed'> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
};

/** The kinds a customer or contractor is actively waiting on. */
const LOUD_KINDS = /^(sq_|customer_|job_|contractor_announcement)/;

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

/**
 * Permanent means the address is wrong, not that the mailbox was briefly
 * full. Only a permanent failure should stop us writing to someone again —
 * Resend reports it as bounce.type, and calls the rest Transient.
 */
function isHardBounce(event: ResendEvent): boolean {
  const b = event.data?.bounce;
  const type = (b?.type ?? '').toLowerCase();
  const sub = (b?.subType ?? '').toLowerCase();
  if (type === 'transient' || type === 'undetermined') return false;
  return type === 'permanent' || sub.includes('nonexistent') || sub.includes('suppressed');
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
    .select('id, kind, to_email')
    .maybeSingle();

  // A message we have no row for is not an error: test sends from the Resend
  // dashboard, and anything sent before this webhook existed.
  if (!row) return NextResponse.json({ received: true, matched: false });

  if (status === 'bounced' && isHardBounce(event)) {
    await admin.rpc('record_undeliverable_email', {
      p_email: row.to_email,
      p_kind: row.kind,
      p_detail: detail,
    });
  }

  // Someone has to be told. A bounced invitation is a contractor who never
  // saw the job; a bounced quote alert is a customer who thinks we forgot.
  if ((status === 'bounced' || status === 'complained') && LOUD_KINDS.test(row.kind)) {
    await notifyAdmins(
      `Email ${status}: ${row.kind}`,
      [
        `${row.kind} to ${row.to_email} was ${status}.`,
        detail,
        '',
        status === 'bounced'
          ? 'They did not receive it. If this is a customer mid-job, they need contacting another way.'
          : 'They marked it as spam. Do not send to this address again without asking.',
      ].join('\n'),
    );
  }

  return NextResponse.json({ received: true, matched: true, status });
}
