import { Resend } from 'resend';

/**
 * Fire-and-forget notification to the site admins (ADMIN_EMAILS). Never
 * throws — a failed or unconfigured send must not break the calling flow
 * (e.g. a contractor signup).
 */
export async function notifyAdmins(subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (!apiKey || !from || admins.length === 0) {
    console.warn('[adminNotify] skipped — RESEND_API_KEY/EMAIL_FROM/ADMIN_EMAILS not configured');
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to: admins, subject, text });
    if (error) console.error('[adminNotify] send failed:', error.message);
  } catch (err) {
    console.error('[adminNotify] send failed:', err);
  }
}
