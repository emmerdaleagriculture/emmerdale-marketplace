/**
 * The warning an admin sends a contractor caught trying to take a customer
 * off the platform: the step before removal (contractor terms clauses 7 and
 * 8). Sent as an admin_direct email, so the admin can edit the words first;
 * this is only the starting draft.
 */
export const WARNING_SUBJECT = 'A warning about your Emmerdale Agriculture account';

export function warningDraft({
  contactName,
  job,
}: {
  contactName: string | null;
  /** "land clearance job in DA13", when the warning is about one job. */
  job?: string | null;
}): string {
  const what = job
    ? `On the ${job}, you tried to arrange contact with the customer outside the platform.`
    : 'You recently tried to arrange contact with a customer outside the platform.';
  return [
    `Hello${contactName ? ` ${contactName}` : ''},`,
    `${what} That isn't allowed. Until a customer accepts your price, every conversation goes through the messages on the site, and the job is booked and paid for through us. Clause 8 of our contractor terms says you mustn't solicit a customer we introduced for work outside the platform.`,
    `This is a formal warning. If it happens again we'll remove your account, and you won't receive any more jobs from us.`,
    `If you think we've got this wrong, reply to this email or write to tom@emmerdaleagriculture.com.`,
    `Tom\nEmmerdale Agriculture`,
  ].join('\n\n');
}
