import type { ErrorEvent } from '@sentry/nextjs';

/**
 * What must never leave this stack inside an error report.
 *
 * Sentry attaches request bodies, query strings, cookies and breadcrumb data
 * to events by default. On this site those carry a customer's name, email
 * address, phone number, postcode and the free text they typed about their
 * field — /start posts every one of them through a server action, and the
 * Stripe routes carry the rest. The org is in Sentry's EU region, which is
 * the right place for it to land, but the right place is not a reason to send
 * more than a stack trace.
 *
 * The `dataCollection` options in each config are the first line: they stop
 * the SDK collecting this in the first place. This is the second — a walk of
 * every event on the way out, so a value that reaches Sentry some other way
 * (a caught error whose message quotes a row, a breadcrumb from a fetch) is
 * still replaced before it is sent.
 *
 * Deliberately NOT scrubbed: the refusal reasons recorded by refuse() in
 * start/actions.ts. Those are codes — 'email_undeliverable',
 * 'validation:raw_text:too_small' — never the address or the text itself,
 * which is exactly why they are safe to read in an error report.
 */

const REDACTED = '[redacted]';

/**
 * Matched case-insensitively against every key in an event. Names are the
 * column and form-field names this app actually uses, plus the generic
 * spellings a third-party integration might send.
 */
const SENSITIVE_KEYS = new Set([
  // The contact block, as posted by confirmJobAction
  'contact_name',
  'contact_email',
  'contact_phone',
  'name',
  'email',
  'phone',
  'telephone',
  // What the customer typed and where their land is
  'raw_text',
  'location_raw',
  'service_verbatim',
  'service_other_text',
  'access_notes',
  'obstacles',
  'postcode',
  'gate_w3w',
  'lat',
  'lng',
  'boundary',
  // Capability tokens — these ARE the authorisation, not a reference to it
  'client_token',
  'token',
  'captchatoken',
  'cf-turnstile-response',
  'authorization',
  'cookie',
  // Network identity
  'ip',
  'ip_address',
  'x-forwarded-for',
]);

/** A job's client_token or a uuid sitting in a path — /quote/<token> is a URL that grants access. */
const TOKEN_IN_PATH =
  /\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})/gi;

const redactPath = (url: string) => url.replace(TOKEN_IN_PATH, `/${REDACTED}`);

/**
 * Replace sensitive values anywhere in a structure. Depth-capped because an
 * event is arbitrary JSON from the SDK and a cycle here would hang the send.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

/** Every event passes through here on its way to Sentry. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    // Set explicitly rather than trusted to be absent: dataCollection turns
    // collection off, and this makes it true regardless of that setting.
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) event.request.headers = redact(event.request.headers) as typeof event.request.headers;
    if (event.request.query_string) event.request.query_string = REDACTED;
    if (event.request.url) event.request.url = redactPath(event.request.url);
  }

  if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts;

  // The user object is an identity by definition; an id is enough to group by.
  if (event.user) event.user = { id: event.user.id };

  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.data) crumb.data = redact(crumb.data) as typeof crumb.data;
    if (typeof crumb.message === 'string') crumb.message = redactPath(crumb.message);
  }

  return event;
}
