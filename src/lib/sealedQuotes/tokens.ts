import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Sealed-quote link tokens: 48 lowercase hex chars (24 random bytes,
 * 192 bits). The same format everywhere — invitation links, client portal,
 * email-parse confirmations — whether minted app-side (here) or SQL-side
 * (sq_token(), same encoding), so one regex validates all of them.
 *
 * Primary validation is an indexed equality lookup of an unguessable value;
 * the format check just rejects junk before it costs a query.
 */
export const TOKEN_RE = /^[0-9a-f]{48}$/;

export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

export function isTokenFormat(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

/** Constant-time compare for the rare compare-against-fetched-value case. */
export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
