// The key on Twilio's status callback URL. Twilio signs its webhooks with the
// account auth token, which we deliberately don't hold (texts are sent with an
// API key), so the callback is authenticated by a key in its own URL instead:
// an HMAC of the Twilio secret we do hold, worked out the same way by the
// sender (send-emails) and the receiver (sms-events). Rotating the API key
// rotates this too; callbacks for texts sent before then are then refused,
// which costs nothing but a few delivery ticks.

export async function smsCallbackKey(): Promise<string | null> {
  const secret = Deno.env.get('TWILIO_API_KEY_SECRET') ?? Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('sms-events'));
  return [...new Uint8Array(mac)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function smsCallbackUrl(key: string): string | null {
  const base = Deno.env.get('SUPABASE_URL');
  return base ? `${base.replace(/\/$/, '')}/functions/v1/sms-events?k=${key}` : null;
}
