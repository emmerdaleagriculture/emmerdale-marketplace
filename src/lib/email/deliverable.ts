import { resolveMx, resolve4, resolve6 } from 'node:dns/promises';
import { suggestEmailFix } from './typos';

/**
 * Does this address's domain accept mail at all?
 *
 * The funnel's whole contract with a customer runs over email — the portal
 * link, the first-quote alert, the payment link, the completion confirmation.
 * An address that parses but doesn't exist loses every one of them silently:
 * Resend accepts the send, the queue row reads `sent`, and the customer sits
 * waiting for a quote that has already arrived.
 *
 * The check is deliberately conservative. It blocks only on a definitive "no
 * such domain" or "this domain takes no mail", and fails OPEN on timeouts,
 * SERVFAIL and anything else — a slow resolver must never cost us a real job.
 * That asymmetry is the point: a false block turns a paying customer away,
 * while a false pass costs us only the silence we already have today.
 */

export type EmailProblem = { ok: false; reason: 'no_domain' | 'no_mail_exchanger'; suggestion: string | null };
export type EmailCheck = { ok: true } | EmailProblem;

const TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

/** Per-instance memo. Fluid Compute reuses instances, so repeats are common. */
const cache = new Map<string, { at: number; ok: boolean; reason?: EmailProblem['reason'] }>();

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), TIMEOUT_MS),
    ),
  ]);
}

function code(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** ENOTFOUND/NXDOMAIN: the name does not exist. ENODATA: it does, but not for this type. */
const ABSENT = new Set(['ENOTFOUND', 'NXDOMAIN', 'ENODATA']);

async function domainTakesMail(domain: string): Promise<{ ok: boolean; reason?: EmailProblem['reason'] }> {
  let mxAbsent: string | null = null;
  try {
    const mx = await withTimeout(resolveMx(domain));
    if (mx.length > 0) return { ok: true };
    mxAbsent = 'ENODATA';
  } catch (err) {
    const c = code(err);
    if (!ABSENT.has(c)) return { ok: true }; // timeout, SERVFAIL, anything odd → let it through
    mxAbsent = c;
  }

  // No MX is not the end of it: RFC 5321 §5.1 falls back to the address
  // record, and plenty of small business domains rely on exactly that.
  for (const lookup of [resolve4, resolve6]) {
    try {
      const rows = await withTimeout(lookup(domain));
      if (rows.length > 0) return { ok: true };
    } catch (err) {
      if (!ABSENT.has(code(err))) return { ok: true };
    }
  }

  return { ok: false, reason: mxAbsent === 'ENODATA' ? 'no_mail_exchanger' : 'no_domain' };
}

export async function checkEmailDeliverable(email: string): Promise<EmailCheck> {
  const domain = email.trim().toLowerCase().split('@')[1];
  // No domain at all is a syntax problem, and zod has already had its say.
  if (!domain) return { ok: true };

  const hit = cache.get(domain);
  const fresh = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit : null;
  const result = fresh ?? { ...(await domainTakesMail(domain)), at: Date.now() };

  if (!fresh) {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(domain, { at: Date.now(), ok: result.ok, reason: result.reason });
  }
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.reason ?? 'no_domain', suggestion: suggestEmailFix(email) };
}

/** What the address is for, so the sentence explains the stakes it carries. */
const DEFAULT_STAKE = 'Everything about your job goes to this address';

/** One wording for every form, so the same slip reads the same way twice. */
export function emailProblemMessage(
  email: string,
  problem: EmailProblem,
  stake: string = DEFAULT_STAKE,
): string {
  const domain = email.trim().split('@')[1] ?? 'that domain';
  if (problem.suggestion) {
    return `We can’t send email to ${domain} — did you mean ${problem.suggestion}? ${stake}, so it needs to be right.`;
  }
  return problem.reason === 'no_domain'
    ? `We can’t find ${domain} — please check the spelling. ${stake}.`
    : `${domain} doesn’t accept email. Please use an address you can receive at — ${stake.charAt(0).toLowerCase()}${stake.slice(1)}.`;
}

/**
 * The guard as the forms use it: an error string to show, or null to proceed.
 */
export async function emailDeliveryError(
  email: string,
  stake?: string,
): Promise<string | null> {
  const check = await checkEmailDeliverable(email);
  return check.ok ? null : emailProblemMessage(email, check, stake);
}
