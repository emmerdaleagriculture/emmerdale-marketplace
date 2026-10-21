/**
 * The App Store / Play reviewers' demo logins (scripts/seedDemoAccounts.ts).
 * Reviewers have no inbox for these addresses, so the email-code screen
 * takes one fixed code for them, DEMO_EMAIL_CODE, and sends nothing. Every
 * other address is untouched, and with the variable unset (or not six
 * digits) nothing is special about these two either.
 */
export const DEMO_EMAILS = new Set(['demo-customer@emmerdaleagriculture.com', 'demo-contractor@emmerdaleagriculture.com']);

/** The fixed code for this address, or null when it gets the real email. */
export function demoEmailCode(email: string, env: Record<string, string | undefined> = process.env): string | null {
  const code = (env.DEMO_EMAIL_CODE ?? '').trim();
  if (!/^\d{6}$/.test(code)) return null;
  return DEMO_EMAILS.has(email.trim().toLowerCase()) ? code : null;
}
