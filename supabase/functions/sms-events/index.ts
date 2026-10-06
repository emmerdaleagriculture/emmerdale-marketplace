// Twilio status callback for texts sent by send-emails (sms.ts). Records the
// last word on delivery in pending_sms.delivery_status, which the
// /admin/submissions cards count. See migration 20261006190000.
//
// Twilio posts form-encoded MessageSid, MessageStatus (queued, sent,
// delivered, undelivered, failed) and, on failure, ErrorCode. The URL's `k`
// must match smsCallbackKey(); anything else is a 403.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { smsCallbackKey } from '../_shared/smsCallback.ts';

/** How far along each status is. A late "sent" must not overwrite "delivered". */
const RANK: Record<string, number> = {
  accepted: 0, queued: 0, sending: 1, sent: 2, delivered: 3, undelivered: 3, failed: 3, read: 4,
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const expected = await smsCallbackKey();
  const given = new URL(req.url).searchParams.get('k');
  if (!expected || given !== expected) return new Response('forbidden', { status: 403 });

  const form = await req.formData();
  const sid = String(form.get('MessageSid') ?? '');
  const status = String(form.get('MessageStatus') ?? '');
  const errorCode = form.get('ErrorCode');
  if (!sid || !(status in RANK)) return new Response(null, { status: 204 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: row } = await supabase
    .from('pending_sms').select('id, delivery_status').eq('provider_message_id', sid).maybeSingle();
  if (!row) return new Response(null, { status: 204 });
  if ((RANK[row.delivery_status ?? ''] ?? -1) > RANK[status]) return new Response(null, { status: 204 });

  const { error } = await supabase.from('pending_sms').update({
    delivery_status: status,
    delivery_detail: errorCode ? `Twilio error ${errorCode}` : null,
    delivery_at: new Date().toISOString(),
  }).eq('id', row.id);
  if (error) {
    // Twilio retries on a 5xx, so a passing database hiccup isn't lost.
    console.error('[sms-events] update failed:', error.message);
    return new Response('retry', { status: 500 });
  }
  return new Response(null, { status: 204 });
});
