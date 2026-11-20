import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Contractor bank details: the rules for changing them (2026-11-20).
 *
 * A sort code and account number only let someone pay money in, so the
 * danger is a swap, not theft: someone in a contractor's account changes
 * them and the next payout goes astray. A change is confirmed with a code
 * emailed to the contractor, holds payouts for HOLD_HOURS, and is logged.
 */

export const HOLD_HOURS = 72;
export const CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
/** The least time between two codes, so the form can't be used to spam. */
export const RESEND_SECONDS = 60;

/** "12-34-56" from six digits however typed, or null. */
export function normaliseSortCode(input: string): string | null {
  const d = input.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(d) || d === '000000') return null;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/** Eight digits (a seven-digit account gains its leading zero), or null. */
export function normaliseAccountNumber(input: string): string | null {
  const d = input.replace(/\s/g, '');
  if (!/^\d{7,8}$/.test(d)) return null;
  const n = d.padStart(8, '0');
  return n === '00000000' ? null : n;
}

export function normaliseAccountName(input: string): string | null {
  const n = input.replace(/\s+/g, ' ').trim();
  return n.length >= 2 && n.length <= 70 ? n : null;
}

export const last4 = (accountNumber: string) => accountNumber.slice(-4);
/** "••-••-56": enough to recognise, not enough to use. */
export const maskSortCode = (sortCode: string) => `••-••-${sortCode.slice(-2)}`;

/** When payouts may go to details changed at `now`. */
export function holdUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + HOLD_HOURS * 3600_000);
}

export function onHold(hold: string | null | undefined, now: Date = new Date()): boolean {
  return !!hold && new Date(hold).getTime() > now.getTime();
}

/** A six-digit code, leading zeros kept. */
export function makeCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** The stored form of a code: bound to the contractor, never the code itself. */
export function hashCode(contractorId: string, code: string): string {
  return createHash('sha256').update(`${contractorId}:${code}`).digest('hex');
}

export function codeMatches(contractorId: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(contractorId, code.replace(/\s/g, '')), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "j•••@example.com", for "we sent a code to …". */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 1)}•••@${domain}`;
}
