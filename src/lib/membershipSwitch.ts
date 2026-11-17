/**
 * Accounts allowed to flip their own membership (none / Premium / Open) from
 * the dashboard without paying, for seeing each tier as a contractor does.
 * The switch writes the comp columns, so it only works for an account with no
 * Stripe subscription: a live subscription outranks the comps.
 *
 * Client-safe: a plain list, checked again on the server before any write.
 */
export const MEMBERSHIP_SWITCHERS = ['tom@hampshirepaddockmanagement.com'] as const;

export function canSwitchMembership(email: string | null | undefined): boolean {
  return Boolean(email && (MEMBERSHIP_SWITCHERS as readonly string[]).includes(email.toLowerCase()));
}
