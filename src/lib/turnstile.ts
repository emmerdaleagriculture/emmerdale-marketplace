/**
 * Server-side Cloudflare Turnstile verification for the /start parse flow.
 *
 * This is deliberately separate from the auth forms, which forward tokens to
 * Supabase (options.captchaToken) and must never call siteverify themselves —
 * tokens are single-use. The parse action has no Supabase Auth in the loop,
 * so it verifies the token itself, exactly once.
 *
 * **This function cannot refuse anybody.** It reports, and the flow continues
 * regardless — which is why it returns a reason and not a verdict. A paid
 * click must never dead-end on a third-party blip (spec §6.4).
 *
 * That is a deliberate trade, taken after the first five errors on this flow
 * were read: two were Turnstile refusing a customer whose widget never
 * delivered a token, and one of those customers did not come back. Every
 * remaining way to fail is the same shape:
 *
 *  - `missing-token`       the script was blocked or slow, so no token exists
 *  - `timeout-or-duplicate` a real token that aged out (they live 300s) or was
 *                          replayed by a double submit — overwhelmingly a
 *                          customer who took their time over the form
 *  - `invalid-input-*`     malformed, or our own secret is wrong
 *  - `unreachable`/`unreadable`  Cloudflare itself is having a moment
 *
 * None of those distinguishes a bot from a customer on a bad connection, and
 * refusing on any of them costs a click we paid for. The abuse load sits with
 * the honeypot, the minimum fill time, the per-IP hourly rate limit and the
 * length caps — as the note here has claimed since it was written.
 *
 * What we lose: a determined bot can now reach a draft. It still has to clear
 * the rate limiter to reach more than a handful, and every attempt is logged
 * with its reason, so the cost of this decision is visible on /admin/errors
 * rather than assumed.
 */

export type TurnstileResult = {
  /** Absent when the check passed. Otherwise why it did not, for the log. */
  softFail?: string;
};

export async function verifyTurnstile(token: string, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification');
    return { softFail: 'not-configured' };
  }
  // No token at all is the widget never having delivered one — the script
  // blocked or slow, or LandingFlow's 8s escape hatch giving up on it.
  if (!token) return { softFail: 'missing-token' };

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
    console.error('[turnstile] siteverify unreachable:', err);
    return { softFail: 'unreachable' };
  }

  try {
    const json: { success?: boolean; 'error-codes'?: string[] } = await res.json();
    if (json.success) return {};
    // Cloudflare actively rejected the token. Recorded, not enforced: see the
    // note above on why none of these codes identifies a bot reliably enough
    // to spend a customer on.
    return { softFail: (json['error-codes'] ?? []).join(',') || 'verification-failed' };
  } catch (err) {
    console.error('[turnstile] siteverify returned an unreadable response:', err);
    return { softFail: 'unreadable' };
  }
}
