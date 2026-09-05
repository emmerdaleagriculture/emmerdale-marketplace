import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Resend signs its webhooks Svix-style: HMAC-SHA256 over
 * "{svix-id}.{svix-timestamp}.{raw body}", keyed on the base64 body of the
 * whsec_ secret, with the signature header carrying one or more
 * "v1,<base64>" pairs so a secret can be rotated without dropping deliveries.
 *
 * Both our inbound routes need exactly this, and a signature check that has
 * drifted between two copies is a signature check you cannot trust.
 */
export function verifySvixSignature(
  body: string,
  headers: Headers,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !timestamp || !sigHeader) return false;
  // Reject stale timestamps to blunt replays.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of sigHeader.split(' ')) {
    const [, sig] = part.split(',');
    if (!sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
