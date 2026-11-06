/**
 * The iPhone app line (live on the App Store 2026-11-06). Emails get it at
 * the foot; texts get a shorter one, rationed in sms.ts because it can push
 * a text into a second segment. The link is the site's /iphone redirect
 * (next.config.mjs), which keeps it short and lets the target change.
 */

/** Emails to contractors that carry the line. Not the verify-your-address one. */
const CONTRACTOR_KINDS = new Set([
  'sq_invitation', 'sq_invitation_reminder', 'sq_members_first_notice',
  'sq_award_won', 'sq_award_lost', 'sq_quote_confirm',
  'sq_invoice_request', 'sq_invoice_received', 'sq_payout_sent', 'sq_invoice_chase',
  'sq_job_amended', 'sq_message_to_contractor', 'sq_thread_visit_to_contractor',
  'sq_visit_reminder', 'sq_visit_accepted', 'sq_visit_declined',
  'sq_weekly_digest', 'sq_job_withdrawn', 'sq_price_passed', 'sq_contact_warning',
  'sq_job_cancelled_contractor', 'directory_enquiry',
  'application_approved', 'contractor_announcement',
]);

/** Emails to customers about their job that carry the line. */
const CUSTOMER_KINDS = new Set([
  'job_draft_chaser', 'sq_portal_link', 'sq_direct_fallback', 'sq_first_quote', 'sq_new_quotes',
  'sq_payment_link', 'sq_payment_expired', 'sq_award_client', 'sq_no_quotes_yet',
  'sq_rating_request', 'sq_completion_confirm', 'sq_completion_confirm_chase', 'sq_completion_confirmed',
  'sq_balance_due', 'sq_balance_request', 'sq_balance_revised', 'sq_balance_paid',
  'sq_balance_action_needed', 'sq_balance_overdue',
  'sq_visit_revised', 'sq_visit_confirmed', 'sq_thread_visit_to_client', 'sq_message_to_client',
]);

export function appLink(site: string): string {
  return `${site.replace(/\/$/, '')}/iphone`;
}

/** The email body with the app line at its foot, or unchanged. Never to an admin. */
export function withAppLine(text: string, kind: string, toEmail: string, site: string): string {
  if (toEmail === '__admin__') return text;
  const line = CONTRACTOR_KINDS.has(kind)
    ? 'On an iPhone? Get new jobs as notifications, and price, message and invoice from your phone, with our app'
    : CUSTOMER_KINDS.has(kind)
      ? 'On an iPhone? Follow your job, compare prices and message your contractor in our app'
      : null;
  return line ? `${text}\n\n---\n${line}: ${appLink(site)}` : text;
}

/** The text version: short, so a text stays near one segment. */
export function smsAppLine(site: string): string {
  return ` iPhone app: ${appLink(site).replace(/^https?:\/\//, '')}`;
}
