/**
 * "07700 900123" / "+44 (0)7700 900123" / "447700900123" → "+447700900123";
 * null if it isn't a UK mobile. The same rule as the send-emails worker's
 * ukMobile (supabase/functions/send-emails/sms.ts), which is what decides
 * whether a text can actually go — keep the two in step.
 */
export function ukMobile(raw: string): string | null {
  const d = raw.replace(/\(0\)/g, '').replace(/[^\d+]/g, '')
    .replace(/^00/, '+').replace(/^\+?44/, '0');
  return /^07\d{9}$/.test(d) ? `+44${d.slice(1)}` : null;
}
