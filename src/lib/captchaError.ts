/**
 * Supabase (GoTrue) wraps the Cloudflare siteverify reason in the error
 * message. The reason says which layer failed, so each gets distinct and
 * accurate guidance; the raw reason is logged for diagnosis.
 *
 * Returns null when the error is not about the captcha at all, so callers can
 * keep their own wording for everything else ("Incorrect email or password").
 */
export function captchaErrorMessage(message: string, form: string): string | null {
  if (!/captcha/i.test(message)) return null;
  console.error(`[${form}] captcha rejected by Supabase:`, message);
  if (/no captcha_token found/i.test(message)) {
    // The browser submitted without a token — the widget hadn't finished.
    return 'The security check didn’t finish. Wait for it to complete, then submit again.';
  }
  if (/timeout-or-duplicate/i.test(message)) {
    // Token expired (>5 min) or was already used — a fresh one is minted now.
    return 'The security check timed out. It has refreshed — please submit again.';
  }
  if (/invalid-input-response/i.test(message)) {
    // Token was well-formed but Cloudflare rejected it. Almost always a
    // config mismatch (the Supabase secret and the site key belong to
    // different Turnstile widgets), which the user can't fix — so don't
    // tell them to just retry.
    return 'The security check could not be verified. This is a configuration issue on our end — please contact us so we can fix it.';
  }
  return 'The security check failed. Please try again.';
}
