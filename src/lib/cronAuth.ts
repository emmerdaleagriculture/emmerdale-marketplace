import { timingSafeEqual } from 'node:crypto';

function same(given: string | null, secret: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cron route auth. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
 * the SQL scheduler sends `x-cron-secret`. Constant-time compare, and every
 * request is refused when the secret is unset.
 */
export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    same(request.headers.get('authorization'), `Bearer ${secret}`) ||
    same(request.headers.get('x-cron-secret'), secret)
  );
}
