// Drain pending_push through Firebase Cloud Messaging (HTTP v1), after the
// texts (migration 20261018150000_push_notifications). Rows only exist for
// people with a live device token, and nothing is sent until the
// FIREBASE_SERVICE_ACCOUNT secret (the service account's JSON, as one
// string) is set, so this is inert until both are true.
//
// Quiet hours: the same 08:00–20:59 UK window as texts, for anything that
// is not urgent. Urgent — a message, a job won, a premium or first-refusal
// invitation with a clock on it — goes whenever it is queued.

// deno-lint-ignore-file no-explicit-any
type Supabase = any;

const BATCH = 50;
const MAX_ATTEMPTS = 3;
/** A push that waited longer than this (overnight, or FCM down) is stale. */
const MAX_AGE_MS = 18 * 3600 * 1000;
const FIRST_HOUR = 8;
const LAST_HOUR = 20;
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

type PendingPush = {
  id: string;
  kind: string;
  user_id: string;
  to_email: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
};

type Rendered = { title: string; body: string; url: string };

function clip(s: unknown, max: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function gbp(pence: unknown): string {
  if (typeof pence !== 'number' || !Number.isFinite(pence)) return '';
  const pounds = Math.floor(pence / 100);
  const rem = pence % 100;
  return rem ? `£${pounds.toLocaleString('en-GB')}.${String(rem).padStart(2, '0')}` : `£${pounds.toLocaleString('en-GB')}`;
}

function londonTime(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'short' });
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit' }).format(d);
  return sameDay.format(d) === sameDay.format(new Date())
    ? time
    : `${time} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(d)}`;
}

/** The size of a job, if the payload says: "4 acres". */
function size(p: Record<string, unknown>): string | null {
  const v = p.area_value ?? p.area_mapped_value;
  if (typeof v !== 'number' || !v) return null;
  const unit = String(p.area_unit ?? 'acres');
  return `${Math.round(v * 10) / 10} ${unit}`;
}

/**
 * Title, body and destination for each kind, as the PRD's table has them.
 * Null means "this one is email-only after all" (a payload with nothing to
 * link to).
 */
export function renderPush(kind: string, p: Record<string, unknown>, site: string): Rendered | null {
  const service = clip(p.service || 'land work', 40);
  const place = clip(p.postcode_district || p.county || '', 25);
  switch (kind) {
    // ── contractors ────────────────────────────────────────────────────
    case 'sq_invitation': {
      if (!p.token) return null;
      const url = `${site}/quote/${p.token}`;
      const by = londonTime(p.expires_at);
      const where = place ? ` near ${place}` : '';
      const sz = size(p);
      if (p.premium) {
        // The text says the same: an untapped offer is a pass after 2 hours.
        return { title: `First refusal: ${service}${where}`, body: 'Yours before anyone else. Tap within 2 hours or it opens to others.', url };
      }
      if (p.first_refusal) {
        return { title: `Offered to you first: ${service}${where}`, body: 'Price it or pass before it goes to the market.', url };
      }
      if (p.direct) {
        return { title: `A previous customer wants you again`, body: `${service}${where}. Price it or pass.`, url };
      }
      if (p.open_member) {
        return {
          title: p.distance_miles != null ? `New job ${p.distance_miles} miles away` : 'New job',
          body: `${service}${sz ? ` · ${sz}` : ''}${where}. The customer’s details are on the page.`,
          url,
        };
      }
      return {
        title: p.distance_miles != null ? `New job ${p.distance_miles} miles away` : 'New job to price',
        body: `${service}${sz ? ` · ${sz}` : ''}${where}.${by ? ` Price it by ${by}.` : ''}`,
        url,
      };
    }
    case 'sq_award_won':
      return {
        title: "You've been booked",
        body: `${service}${p.postcode ? ` at ${clip(p.postcode, 10)}` : ''}. Customer details are now in the app.`,
        url: `${site}/won`,
      };
    case 'sq_message_to_contractor':
      if (!p.token) return null;
      return {
        title: `${clip(p.from || 'Customer', 30)}${place ? ` · ${place}` : ''}`,
        body: clip(p.body, 80),
        url: `${site}/quote/${p.token}#messages`,
      };
    case 'sq_payout_sent': {
      const amount = gbp(p.amount_pence);
      return {
        title: "You've been paid",
        body: `${amount ? `${amount} for ` : ''}${service}${place ? ` at ${place}` : ''}.`,
        url: `${site}/won`,
      };
    }
    case 'application_approved':
      return { title: "You're approved", body: 'Jobs near you will appear in the app.', url: `${site}/invitations` };

    // ── customers ──────────────────────────────────────────────────────
    case 'sq_first_quote': {
      if (!p.client_token) return null;
      const price = gbp(p.client_price_pence);
      const who = clip(p.contractor_name || p.contractor_label || 'A contractor', 30);
      return {
        title: `New price for your ${service} job`,
        body: `${who} priced it${price ? ` at ${price}` : ''}.${p.sole_offer ? '' : ' Compare all prices.'}`,
        url: `${site}/my/${p.client_token}`,
      };
    }
    case 'sq_new_quotes': {
      if (!p.client_token) return null;
      const n = Number(p.new_count) || 1;
      return {
        title: `${n} new price${n === 1 ? '' : 's'} for your ${service} job`,
        body: `${Number(p.total_count) || n} to compare side by side.`,
        url: `${site}/my/${p.client_token}`,
      };
    }
    case 'sq_message_to_client':
      if (!p.client_token) return null;
      return { title: clip(p.from || 'Your contractor', 40), body: clip(p.body, 80), url: `${site}/my/${p.client_token}#messages` };
    case 'sq_completion_confirm':
      if (!p.client_token) return null;
      return {
        title: 'Your job is done',
        body: `${clip(p.contractor_business_name || 'Your contractor', 30)} marked it complete. Check the photos and sign off.`,
        url: `${site}/my/${p.client_token}`,
      };
    case 'sq_quotes_nudge_1':
    case 'sq_quotes_nudge_2': {
      if (!p.client_token) return null;
      const n = Number(p.quote_count) || 1;
      return {
        title: `You have ${n} price${n === 1 ? '' : 's'} waiting`,
        body: "Pick one to book. Your deposit is held until you're happy.",
        url: `${site}/my/${p.client_token}`,
      };
    }
    default:
      return null;
  }
}

/** Sent whenever queued; everything else waits for the daytime window. */
export function isUrgent(kind: string, p: Record<string, unknown>): boolean {
  if (kind === 'sq_message_to_contractor' || kind === 'sq_message_to_client' || kind === 'sq_award_won') return true;
  if (kind === 'sq_invitation' && (p.premium || p.first_refusal)) return true;
  return false;
}

function linkCode(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(7))].map((b) => abc[b % 62]).join('');
}

function londonHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(now));
}

// ── Google OAuth for the service account ─────────────────────────────────

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let cachedToken: { value: string; expiresAt: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const bin = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const key = await importPrivateKey(sa.private_key);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const assertion = `${header}.${claims}.${b64url(sig)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`google token: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  cachedToken = { value: j.access_token, expiresAt: now + Number(j.expires_in ?? 3600) };
  return cachedToken.value;
}

/** FCM's way of saying the token is dead and should be forgotten. */
function tokenIsDead(status: number, res: Record<string, any>): boolean {
  // UNREGISTERED is the documented "this token is gone" answer. A bare 404
  // can be a wrong project id or a disabled API, which must not revoke
  // every device it touches.
  const code = res?.error?.details?.find((d: any) => d?.errorCode)?.errorCode;
  return code === 'UNREGISTERED' ||
    (status === 400 && /registration token|not a valid FCM/i.test(String(res?.error?.message ?? '')));
}

export async function drainPush(
  supabase: Supabase,
  site: string,
  allowlist: string[],
  _contractorKinds: Set<string>,
): Promise<Record<string, unknown>> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return { configured: false };
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw);
    if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('missing fields');
  } catch (err) {
    return { error: `FIREBASE_SERVICE_ACCOUNT unreadable: ${String(err).slice(0, 100)}` };
  }

  const now = new Date();
  const daytime = londonHour(now) >= FIRST_HOUR && londonHour(now) <= LAST_HOUR;

  // At night only the urgent kinds are fetched at all: held rows left in
  // the batch would fill it and starve a message behind them.
  let query = supabase
    .from('pending_push')
    .select('id, kind, user_id, to_email, payload, attempts, created_at')
    .eq('status', 'pending')
    .order('created_at')
    .limit(BATCH);
  if (!daytime) {
    query = query.or(
      'kind.in.(sq_message_to_client,sq_message_to_contractor,sq_award_won),' +
      'and(kind.eq.sq_invitation,payload->>premium.eq.true),' +
      'and(kind.eq.sq_invitation,payload->>first_refusal.eq.true)',
    );
  }
  const { data, error } = await query;
  if (error) return { error: error.message };
  const rows = (data ?? []) as PendingPush[];
  if (rows.length === 0) return { processed: 0 };
  const finish = (id: string, fields: Record<string, unknown>) =>
    supabase.from('pending_push').update(fields).eq('id', id);

  let bearer: string | null = null;
  let sent = 0, skipped = 0, failed = 0, retried = 0, held = 0;

  for (const m of rows) {
    const p = m.payload ?? {};
    if (!daytime && !isUrgent(m.kind, p)) { held++; continue; }

    // Test mode holds every push — customer kinds too, by the job's email,
    // as the text channel does.
    const skipReason =
      allowlist.length > 0 && !allowlist.includes(m.to_email.toLowerCase())
        ? 'test mode: not on the allowlist'
      : now.getTime() - new Date(m.created_at).getTime() > MAX_AGE_MS ? 'too old to send'
      : null;
    if (skipReason) { await finish(m.id, { status: 'skipped', detail: skipReason }); skipped++; continue; }

    const { data: devices } = await supabase
      .from('device_tokens').select('id, token').eq('user_id', m.user_id).is('revoked_at', null);
    if (!devices?.length) { await finish(m.id, { status: 'skipped', detail: 'no device' }); skipped++; continue; }

    const r = renderPush(m.kind, p, site);
    if (!r) { await finish(m.id, { status: 'skipped', detail: 'nothing to render' }); skipped++; continue; }

    // The code is saved before the push goes, so a tap can never arrive
    // ahead of the row that answers it.
    const code = linkCode();
    const { error: linkErr } = await finish(m.id, { title: r.title, body: r.body, link: r.url, link_code: code });
    if (linkErr) continue; // a code collision, or the database: next run tries again
    const tapUrl = `${site}/t/${code}`;

    try {
      bearer ??= await accessToken(sa);
    } catch (err) {
      return { error: String(err).slice(0, 300), sent, skipped, failed, retried, held };
    }

    let delivered = 0;
    let lastDetail = '';
    let retryable = false;
    for (const d of devices as { id: string; token: string }[]) {
      let status = 0;
      let res: Record<string, any> = {};
      let refreshed = false;
      try {
        const sendOnce = async () => fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title: r.title, body: r.body },
              data: { url: tapUrl, kind: m.kind },
              android: { priority: 'high', notification: { channel_id: 'default' } },
              apns: { payload: { aps: { sound: 'default', 'mutable-content': 1 } } },
            },
          }),
        });
        let resp = await sendOnce();
        if (resp.status === 401 && !refreshed) {
          // The cached Google token has lapsed: mint another and try once more.
          refreshed = true;
          cachedToken = null;
          bearer = await accessToken(sa);
          resp = await sendOnce();
        }
        status = resp.status;
        try { res = await resp.json(); } catch { /* no body */ }
      } catch (err) {
        lastDetail = String(err).slice(0, 200);
        retryable = true;
        continue;
      }
      if (status >= 200 && status < 300) {
        delivered++;
      } else if (tokenIsDead(status, res)) {
        await supabase.from('device_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', d.id);
        lastDetail = 'device token no longer valid';
      } else {
        lastDetail = `HTTP ${status}: ${String(res?.error?.message ?? '').slice(0, 200)}`;
        if (status >= 500 || status === 429 || status === 401) retryable = true;
      }
    }

    if (delivered > 0) {
      await finish(m.id, { status: 'sent', sent_at: new Date().toISOString(), attempts: m.attempts + 1, detail: `${delivered}/${devices.length} devices` });
      sent++;
    } else {
      const attempts = m.attempts + 1;
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      await finish(m.id, { status: giveUp ? (lastDetail === 'device token no longer valid' ? 'skipped' : 'failed') : 'pending', attempts, detail: lastDetail || 'not delivered' });
      giveUp ? failed++ : retried++;
    }
  }

  return { processed: rows.length, sent, skipped, retried, failed, held };
}
