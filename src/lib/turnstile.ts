/**
 * Server-side Cloudflare Turnstile verification for the /start parse flow.
 *
 * This is deliberately separate from the auth forms, which forward tokens to
 * Supabase (options.captchaToken) and must never call siteverify themselves —
 * tokens are single-use. The parse action has no Supabase Auth in the loop,
 * so it verifies the token itself, exactly once.
 *
 * Fail-open by design: an unset TURNSTILE_SECRET_KEY or a Cloudflare outage
 * logs and passes. A paid click must never dead-end on a third-party blip
 * (spec §6.4) — rate limits and length caps still carry the abuse load.
 */
export async function verifyTurnstile(
  token: string,
  ip: string,
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification');
    return { ok: true };
  }
  if (!token) return { ok: false, error: 'missing-token' };

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);

  // Timeout + one retry, mirroring fetchPostcodesIo — a transient blip must
  // not cost a conversion.
  let res: Response;
  try {
    try {
      res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(4000),
      });
    }
  } catch (err) {
    console.error('[turnstile] siteverify unreachable — failing open:', err);
    return { ok: true };
  }

  try {
    const json: { success?: boolean; 'error-codes'?: string[] } = await res.json();
    if (json.success) return { ok: true };
    return { ok: false, error: (json['error-codes'] ?? []).join(',') || 'verification-failed' };
  } catch (err) {
    console.error('[turnstile] siteverify returned an unreadable response — failing open:', err);
    return { ok: true };
  }
}
