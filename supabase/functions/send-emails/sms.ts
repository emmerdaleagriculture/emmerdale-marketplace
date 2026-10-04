// Drain pending_sms via Twilio, after the email batch (see migration
// 20261004150000_contractor_sms). Rows only exist while
// app_config.sq_sms_enabled = 1, and nothing is sent until the TWILIO_*
// secrets are set, so this is inert until both are switched on.
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either
// TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (a number, so STOP replies work).

// deno-lint-ignore-file no-explicit-any
type Supabase = any;

const BATCH = 50;
const MAX_ATTEMPTS = 3;
/** A text that waited longer than this (overnight, or Twilio down) is stale. */
const MAX_AGE_MS = 18 * 3600 * 1000;
/** Texts go out 08:00–20:59 UK time; anything queued outside waits. */
const FIRST_HOUR = 8;
const LAST_HOUR = 20;
/** Twilio: the recipient replied STOP. */
const UNSUBSCRIBED = 21610;

type PendingSms = {
  id: string;
  kind: string;
  to_phone: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  contractor_id: string;
  contractors: { email: string | null; notify_sms: boolean } | null;
};

/** "07700 900123" / "+44 (0)7700 900123" / "447700900123" → "+447700900123"; null if not a UK mobile. */
export function ukMobile(raw: string): string | null {
  const d = raw.replace(/\(0\)/g, '').replace(/[^\d+]/g, '')
    .replace(/^00/, '+').replace(/^\+?44/, '0');
  return /^07\d{9}$/.test(d) ? `+44${d.slice(1)}` : null;
}

/**
 * Keep a text to the GSM character set. One curly apostrophe in a customer's
 * words switches the whole message to UCS-2, which cuts a segment from 160
 * characters to 70 and roughly triples the cost.
 */
function gsm(s: unknown, max = 60): string {
  const t = String(s ?? '')
    .replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E£]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

export function renderSms(kind: string, p: Record<string, unknown>, site: string): string | null {
  const service = gsm(p.service || 'land work', 40);
  const where = gsm(p.postcode_district || p.county || '', 25);
  const job = where ? `${service}, ${where}` : service;
  switch (kind) {
    case 'sq_invitation': {
      if (!p.token) return null;
      const dist = p.distance_miles != null ? ` (${p.distance_miles} mi)` : '';
      const url = `${site}/quote/${p.token}`;
      if (p.premium || p.first_refusal) {
        return `Emmerdale Agriculture: a new job is offered to you first - ${job}${dist}. Price it or pass: ${url}`;
      }
      if (p.direct) {
        return `Emmerdale Agriculture: a previous customer wants you again - ${job}. Price it or pass: ${url}`;
      }
      return `Emmerdale Agriculture: new job to price - ${job}${dist}. ${url}`;
    }
    case 'sq_award_won': {
      const who = [gsm(p.contact_name, 30), gsm(p.contact_phone, 20)].filter(Boolean).join(' ');
      return `Emmerdale Agriculture: you've got the job - ${service}` +
        (p.postcode ? `, ${gsm(p.postcode, 10)}` : '') + '. ' +
        (who ? `Customer: ${who}. ` : '') +
        `Please contact them within 24h. Details: ${site}/won`;
    }
    case 'sq_message_to_contractor':
      if (!p.token) return null;
      return `Emmerdale Agriculture: the customer has sent you a message about ${job}. ` +
        `Read and reply: ${site}/quote/${p.token}#messages`;
    default:
      return null;
  }
}

function londonHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London',
  }).format(now));
}

export async function drainSms(
  supabase: Supabase,
  site: string,
  allowlist: string[],
): Promise<Record<string, unknown>> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const fromNumber = Deno.env.get('TWILIO_FROM');
  if (!sid || !token || !(service || fromNumber)) return { configured: false };

  const now = new Date();
  const hour = londonHour(now);
  if (hour < FIRST_HOUR || hour > LAST_HOUR) return { held: 'quiet hours' };

  const { data, error } = await supabase
    .from('pending_sms')
    .select('id, kind, to_phone, payload, attempts, created_at, contractor_id, contractors(email, notify_sms)')
    .eq('status', 'pending')
    .order('created_at')
    .limit(BATCH);
  if (error) return { error: error.message };

  let sent = 0, skipped = 0, failed = 0, retried = 0;
  const finish = (id: string, fields: Record<string, unknown>) =>
    supabase.from('pending_sms').update(fields).eq('id', id);

  for (const m of (data ?? []) as PendingSms[]) {
    // Re-checked at send time: they may have opted out since it was queued.
    const skipReason =
      !m.contractors?.notify_sms ? 'opted out'
      : allowlist.length > 0 && !allowlist.includes(String(m.contractors.email ?? '').toLowerCase())
        ? 'test mode: not on the allowlist'
      : now.getTime() - new Date(m.created_at).getTime() > MAX_AGE_MS ? 'too old to send'
      : null;
    if (skipReason) {
      await finish(m.id, { status: 'skipped', detail: skipReason });
      skipped++;
      continue;
    }
    const to = ukMobile(m.to_phone);
    if (!to) {
      await finish(m.id, { status: 'skipped', detail: 'not a UK mobile number' });
      skipped++;
      continue;
    }
    const body = renderSms(m.kind, m.payload ?? {}, site);
    if (!body) {
      await finish(m.id, { status: 'failed', detail: 'nothing to render' });
      failed++;
      continue;
    }

    const form = new URLSearchParams({ To: to, Body: body });
    if (service) form.set('MessagingServiceSid', service);
    else form.set('From', fromNumber!);

    let status = 0;
    let res: Record<string, any> = {};
    let thrown: string | null = null;
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      status = r.status;
      try { res = await r.json(); } catch { /* no body */ }
    } catch (err) {
      thrown = String(err).slice(0, 300);
    }

    if (status >= 200 && status < 300) {
      await finish(m.id, { status: 'sent', sent_at: new Date().toISOString(),
                           provider_message_id: res.sid ?? null, attempts: m.attempts + 1 });
      sent++;
    } else if (res.code === UNSUBSCRIBED) {
      // They texted STOP. Record it where /account can show and undo it.
      await supabase.from('contractors').update({ notify_sms: false }).eq('id', m.contractor_id);
      await finish(m.id, { status: 'skipped', detail: 'replied STOP' });
      skipped++;
    } else {
      // A 4xx is Twilio saying no (bad number, blocked); only a 5xx, a 429 or
      // a network error is worth another go.
      const attempts = m.attempts + 1;
      const retryable = thrown != null || status >= 500 || status === 429;
      const detail = thrown ?? `HTTP ${status}${res.code ? ` code ${res.code}` : ''}: ${String(res.message ?? '').slice(0, 250)}`;
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      await finish(m.id, { status: giveUp ? 'failed' : 'pending', attempts, detail });
      giveUp ? failed++ : retried++;
    }
  }

  return { processed: (data ?? []).length, sent, skipped, retried, failed };
}
