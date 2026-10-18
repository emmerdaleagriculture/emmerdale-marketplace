/**
 * The rules of the phone step that both the form (browser) and the actions
 * (server) need. Kept free of server imports; lib/app/phone.ts has the
 * database side.
 */
export const RESEND_AFTER_S = 30;
export const MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 10;

export type PhoneVerification = {
  phone: string | null;
  last_sent_at: string | null;
  failures: number;
  locked_until: string | null;
  verified_at: string | null;
  match_user_id: string | null;
};

/** Minutes left on a lockout, or 0. */
export function lockedMinutes(v: PhoneVerification | null, now = Date.now()): number {
  if (!v?.locked_until) return 0;
  const left = new Date(v.locked_until).getTime() - now;
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

/** Seconds before another code may be sent, or 0. */
export function resendWaitSeconds(v: PhoneVerification | null, now = Date.now()): number {
  if (!v?.last_sent_at) return 0;
  const left = RESEND_AFTER_S * 1000 - (now - new Date(v.last_sent_at).getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** "tom@example.com" → "t•••@example.com": enough to recognise, not to learn. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}•••@${domain}`;
}
