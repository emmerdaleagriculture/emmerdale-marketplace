import { secureEqual } from '@/lib/secureEqual';

/**
 * Cron route auth. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
 * the SQL scheduler sends `x-cron-secret`. Constant-time compare, and every
 * request is refused when the secret is unset.
 */
export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  const header = request.headers.get('x-cron-secret');
  return (auth !== null && secureEqual(auth, `Bearer ${secret}`)) || (header !== null && secureEqual(header, secret));
}
