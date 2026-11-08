import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string compare for secrets and tokens. Both sides are hashed
 * first so the compare is always 32 bytes: a plain length check before
 * timingSafeEqual would still tell a prober when a guess has the right length.
 */
export function secureEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
