// Drain pending_sms via Twilio, after the email batch (see migration
// 20261006170000_contractor_sms). Rows only exist while
// app_config.sq_sms_enabled = 1, and nothing is sent until the TWILIO_*
// secrets are set, so this is inert until both are switched on.
//
// Secrets: TWILIO_ACCOUNT_SID (AC…); to sign in, either an API key
// (TWILIO_API_KEY_SID, SK…, and TWILIO_API_KEY_SECRET) or TWILIO_AUTH_TOKEN;
// and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (a number, so STOP
// replies work).

// deno-lint-ignore-file no-explicit-any
import { smsCallbackKey, smsCallbackUrl } from '../_shared/smsCallback.ts';
import { smsAppLine } from './appline.ts';

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
  email_id: string | null;
  hold_until: string | null;
  kind: string;
  to_phone: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  contractor_id: string | null;
  submission_id: string | null;
  contractors: { email: string | null; notify_sms: boolean } | null;
  job_submissions: { contact_email: string | null; notify_sms: boolean } | null;
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

/**
 * A text's body. Every URL goes through `link`, which the worker uses to swap
 * it for a short /t/<code> link that counts taps; the default leaves it be.
 */
export function renderSms(
  kind: string,
  p: Record<string, unknown>,
  site: string,
  link: (url: string) => string = (u) => u,
): string | null {
  const service = gsm(p.service || 'land work', 40);
  const where = gsm(p.postcode_district || p.county || '', 25);
  const job = where ? `${service}, ${where}` : service;
  switch (kind) {
    case 'sq_invitation': {
      if (!p.token) return null;
      const dist = p.distance_miles != null ? ` (${p.distance_miles} mi)` : '';
      const url = link(`${site}/quote/${p.token}`);
      if (p.open_first) {
        // The Open head start (migration 20261021100000): theirs before
        // Premium members, and the same 2-hour tap rule.
        return `Emmerdale Agriculture: Open members first - ${job}${dist}. Premium members see it in ${p.open_first_hours ?? 2}h. Tap within 2h or it counts as a pass: ${url}`;
      }
      if (p.premium) {
        // Premium first look: an untapped text is a pass after 2 hours
        // (migration 20261016200000), so the text says so, briefly.
        return `Emmerdale Agriculture: yours first - ${job}${dist}. Tap within 2h or it opens to others: ${url}`;
      }
      if (p.first_refusal) {
        return `Emmerdale Agriculture: a new job is offered to you first - ${job}${dist}. Price it or pass: ${url}`;
      }
      if (p.open_member) {
        return `Emmerdale Agriculture: new job - ${job}${dist}. Customer's details are on the page: ${url}`;
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
        `Please contact them within 24h. Details: ${link(`${site}/won`)}`;
    }
    case 'sq_message_to_contractor':
      if (!p.token) return null;
      return `Emmerdale Agriculture: the customer has sent you a message about ${job}. ` +
        `Read and reply: ${link(`${site}/quote/${p.token}#messages`)}`;

    // To customers who turned texts on for the job.
    case 'sq_first_quote':
      if (!p.client_token) return null;
      return `Emmerdale Agriculture: a contractor has priced your ${service} job. ` +
        `See it: ${link(`${site}/my/${p.client_token}`)}`;
    case 'sq_new_quotes': {
      if (!p.client_token) return null;
      const n = Number(p.new_count) || 1;
      return `Emmerdale Agriculture: ${n} new price${n === 1 ? '' : 's'} on your job. ` +
        `See them: ${link(`${site}/my/${p.client_token}`)}`;
    }
    case 'sq_message_to_client':
      if (!p.client_token) return null;
      return `Emmerdale Agriculture: ${gsm(p.from || 'your contractor', 30)} has sent you a message about your ${service} job. ` +
        `Read and reply: ${link(`${site}/my/${p.client_token}#messages`)}`;
    default:
      return null;
  }
}

/** GSM-7 segments: 160 characters alone, 153 a part once it splits. */
export function segments(body: string): number {
  return body.length <= 160 ? 1 : Math.ceil(body.length / 153);
}

/**
 * The body with the app line: always when it costs nothing (no extra
 * segment), otherwise only when `due` (this phone hasn't had it for 30 days).
 * Every body here is GSM-7 (gsm() above), so length is the measure.
 */
export function withSmsAppLine(body: string, site: string, due = false): string {
  const longer = body + smsAppLine(site);
  return due || segments(longer) === segments(body) ? longer : body;
}

/** How long a phone goes between app lines that cost a segment. */
const APP_LINE_GAP_MS = 30 * 24 * 3600_000;

/** 7 characters of base62: 3.5 trillion codes, so a guess finds nothing. */
function linkCode(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(7))].map((b) => abc[b % 62]).join('');
}

function londonHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London',
  }).format(now));
}

type HeldText = Pick<PendingSms, 'id' | 'email_id' | 'kind' | 'contractor_id' | 'payload'>;

/**
 * Texts that had a push (migration 20261104120000_push_first_texts) and are
 * no longer needed: the push was tapped, or the invitation it is about has
 * been opened since, by any route. Answers id → reason, two queries for the
 * whole batch.
 */
export async function redundantTexts(supabase: Supabase, held: HeldText[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (held.length === 0) return out;

  const emailIds = held.map((m) => m.email_id).filter((x): x is string => Boolean(x));
  const tapped = new Set<string>();
  if (emailIds.length) {
    const { data, error } = await supabase
      .from('pending_push').select('email_id, clicked_at').in('email_id', emailIds);
    if (error) console.error('[send-emails] push-tap lookup failed; held texts will send:', error.message);
    for (const r of (data ?? []) as { email_id: string; clicked_at: string | null }[]) {
      if (r.clicked_at) tapped.add(r.email_id);
    }
  }

  const sub = (m: HeldText) => (typeof m.payload?.submission_id === 'string' ? m.payload.submission_id : null);
  const invites = held.filter((m) => m.kind === 'sq_invitation' && m.contractor_id && sub(m));
  const opened = new Set<string>();
  if (invites.length) {
    // Exact pairs aren't expressible in one filter; both lists bound it to at
    // most (contractors × jobs) in this batch, far under the 1000-row cap.
    const { data, error } = await supabase
      .from('job_invitations').select('contractor_id, submission_id, opened_at')
      .in('submission_id', [...new Set(invites.map(sub))])
      .in('contractor_id', [...new Set(invites.map((m) => m.contractor_id))])
      .not('opened_at', 'is', null);
    if (error) console.error('[send-emails] opened-invitation lookup failed; held texts will send:', error.message);
    for (const r of (data ?? []) as { contractor_id: string; submission_id: string }[]) {
      opened.add(`${r.contractor_id}/${r.submission_id}`);
    }
  }

  for (const m of held) {
    if (m.email_id && tapped.has(m.email_id)) out.set(m.id, 'push opened');
    else if (m.kind === 'sq_invitation' && opened.has(`${m.contractor_id}/${sub(m)}`)) out.set(m.id, 'job already opened');
  }
  return out;
}

/**
 * `pushLive`: the push drain ran cleanly this time (configured, no error).
 * Otherwise no text waits for a push: a broken push channel holds nothing.
 */
export async function drainSms(
  supabase: Supabase,
  site: string,
  allowlist: string[],
  pushLive = false,
): Promise<Record<string, unknown>> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  // An API key is preferred: it can be revoked without touching the
  // account's own auth token.
  const keySid = Deno.env.get('TWILIO_API_KEY_SID');
  const keySecret = Deno.env.get('TWILIO_API_KEY_SECRET');
  const login = keySid && keySecret ? `${keySid}:${keySecret}` : `${sid}:${Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''}`;
  const token = keySid && keySecret ? keySecret : Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const fromNumber = Deno.env.get('TWILIO_FROM');
  if (!sid || !token || !(service || fromNumber)) return { configured: false };

  const callbackKey = await smsCallbackKey();
  const statusCallback = callbackKey ? smsCallbackUrl(callbackKey) : null;

  const now = new Date();
  const hour = londonHour(now);
  if (hour < FIRST_HOUR || hour > LAST_HOUR) return { held: 'quiet hours' };

  // Texts still waiting on their push are left out of the batch altogether,
  // so they can't fill it and starve the texts behind them.
  let query = supabase
    .from('pending_sms')
    .select('id, email_id, hold_until, kind, to_phone, payload, attempts, created_at, contractor_id, submission_id, ' +
      'contractors(email, notify_sms), job_submissions(contact_email, notify_sms)')
    .eq('status', 'pending')
    .order('created_at')
    .limit(BATCH);
  // A text still waiting for its push is held only while the push drain
  // works; a hold that has already settled (hold_until), and the tap check
  // below, apply either way.
  query = query.or(`hold_until.is.null,hold_until.lte.${now.toISOString()}`);
  if (pushLive) query = query.eq('awaiting_push', false);
  const { data, error } = await query;
  if (error) return { error: error.message };
  // A text whose push row was deleted (a deleted job, a deleted account)
  // never settles. The query above can't see it, so it is aged out here.
  if (pushLive) {
    await supabase.from('pending_sms')
      .update({ status: 'skipped', detail: 'too old to send' })
      .eq('status', 'pending').eq('awaiting_push', true)
      .lt('created_at', new Date(now.getTime() - MAX_AGE_MS).toISOString());
  }
  const rowsDue = (data ?? []) as PendingSms[];
  const redundant = await redundantTexts(supabase, rowsDue.filter((m) => m.hold_until));
  // Contractors already signed in on the app aren't told about it.
  const contractorIds = [...new Set(rowsDue.map((m) => m.contractor_id).filter((x): x is string => !!x))];
  const { data: devices } = contractorIds.length
    ? await supabase.from('device_tokens').select('user_id').in('user_id', contractorIds).is('revoked_at', null)
    : { data: [] };
  const hasApp = new Set((devices ?? []).map((d: { user_id: string }) => d.user_id));
  // Phones that have had the app line in the last 30 days. Before the
  // 20261106120000 migration the column is missing: the query errors, and
  // then every phone counts as recent, so only free lines go out.
  const phones = [...new Set(rowsDue.map((m) => m.to_phone))];
  const { data: lined, error: linedErr } = phones.length
    ? await supabase.from('pending_sms').select('to_phone').in('to_phone', phones).eq('app_line', true)
        .gte('sent_at', new Date(now.getTime() - APP_LINE_GAP_MS).toISOString())
    : { data: [], error: null };
  const recentLine = new Set((lined ?? []).map((r: { to_phone: string }) => r.to_phone));

  let sent = 0, skipped = 0, failed = 0, retried = 0;
  const finish = (id: string, fields: Record<string, unknown>) =>
    supabase.from('pending_sms').update(fields).eq('id', id);

  for (const m of rowsDue) {
    // Re-checked at send time: they may have opted out since it was queued.
    // In test mode a customer is held to the allowlist too, by the job's email.
    const who = m.contractor_id
      ? { optedIn: Boolean(m.contractors?.notify_sms), email: m.contractors?.email }
      : { optedIn: Boolean(m.job_submissions?.notify_sms), email: m.job_submissions?.contact_email };
    const skipReason =
      !who.optedIn ? 'opted out'
      : allowlist.length > 0 && !allowlist.includes(String(who.email ?? '').toLowerCase())
        ? 'test mode: not on the allowlist'
      : now.getTime() - new Date(m.created_at).getTime() > MAX_AGE_MS ? 'too old to send'
      : redundant.get(m.id) ?? null;
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
    // One link per text; its code is saved before the text goes, so a tap
    // can never arrive ahead of the row that answers it.
    const code = linkCode();
    let target: string | null = null;
    const rendered = renderSms(m.kind, m.payload ?? {}, site, (url) => {
      target = url;
      return `${site}/t/${code}`;
    });
    const body = rendered && !(m.contractor_id && hasApp.has(m.contractor_id))
      ? withSmsAppLine(rendered, site, !linedErr && !recentLine.has(m.to_phone))
      : rendered;
    const appLine = body !== rendered;
    // One per phone per run too: a batch can hold several texts to one phone.
    if (appLine) recentLine.add(m.to_phone);
    if (!body) {
      await finish(m.id, { status: 'failed', detail: 'nothing to render' });
      failed++;
      continue;
    }
    if (target) {
      const { error: linkErr } = await finish(m.id, { link: target, link_code: code });
      if (linkErr) continue; // a code collision, or the database: next run tries again
    }

    const form = new URLSearchParams({ To: to, Body: body });
    if (statusCallback) form.set('StatusCallback', statusCallback);
    if (service) form.set('MessagingServiceSid', service);
    else form.set('From', fromNumber!);

    let status = 0;
    let res: Record<string, any> = {};
    let thrown: string | null = null;
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(login)}`,
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
                           provider_message_id: res.sid ?? null, attempts: m.attempts + 1,
                           ...(appLine && !linedErr ? { app_line: true } : {}) });
      sent++;
    } else if (res.code === UNSUBSCRIBED) {
      // They texted STOP. Record it where /account or the job page can show
      // and undo it. Twilio blocks the number outright, so for a customer that
      // is every job they gave it on.
      if (m.contractor_id) {
        await supabase.from('contractors').update({ notify_sms: false }).eq('id', m.contractor_id);
      } else {
        await supabase.from('job_submissions').update({ notify_sms: false }).eq('sms_phone', m.to_phone);
      }
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
