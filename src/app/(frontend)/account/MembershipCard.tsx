import Link from 'next/link';
import {
  MEMBERSHIP_NAMES,
  membershipDay,
  priceLabel,
  type Membership,
  type MembershipTier,
} from '@/lib/membership';
import ac from './account.module.css';

type Sub = {
  status: string;
  plan: string | null;
  tier?: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null;

/**
 * Membership on the dashboard: one card, and the whole card is the link to
 * /account/membership, where the plans, the buttons and Stripe's billing
 * portal live. It says what they have (or what they'd get) and the next
 * thing that matters: a renewal date, a failed payment, an ending plan.
 */
export function MembershipCard({
  membership,
  sub,
  compedUntil,
  openCompedUntil,
  notice,
  pending = false,
  suspended = false,
}: {
  /** Tier held right now, from membershipOf: paid or on us. */
  membership: Membership;
  sub: Sub;
  compedUntil: string | null;
  openCompedUntil: string | null;
  /** `?sub=` from an old Stripe return URL that still points at the dashboard. */
  notice?: string;
  /** Application not yet approved: paid membership waits for approval. */
  pending?: boolean;
  /** Suspended after approval: joining restores the account. */
  suspended?: boolean;
}) {
  const member = membership !== null;
  const active = sub?.status === 'active' || sub?.status === 'past_due';
  const billed: MembershipTier | null = active ? (sub?.tier === 'open' ? 'open' : 'premium') : null;
  const plan: 'monthly' | 'annual' = sub?.plan === 'annual' ? 'annual' : 'monthly';
  const name = member ? MEMBERSHIP_NAMES[membership] : null;
  const until = membership === 'open' ? openCompedUntil : compedUntil;
  const onUsUntil =
    !billed && until && new Date(until).getFullYear() < 2099 ? ` until ${membershipDay(until)}` : '';

  let status: React.ReactNode;
  if (member && billed && sub?.status === 'past_due') {
    status = (
      <>
        <b>Your last payment didn’t go through.</b> Stripe will try again — update your card to keep
        your membership.
      </>
    );
  } else if (member && billed && sub?.cancel_at_period_end && sub.current_period_end) {
    status = (
      <>
        Your {MEMBERSHIP_NAMES[billed]} membership ends on {membershipDay(sub.current_period_end)} and
        won’t renew.
      </>
    );
  } else if (member && billed) {
    status = (
      <>
        {priceLabel(billed, plan)}
        {billed !== membership ? ` for ${MEMBERSHIP_NAMES[billed]}` : ''}
        {sub?.current_period_end ? `, renews ${membershipDay(sub.current_period_end)}` : ''}.
      </>
    );
  } else if (member) {
    status = <>{name} membership on us{onUsUntil}.</>;
  }

  const benefit = pending && member
    ? `${name} starts working the moment we approve your application.`
    : membership === 'open'
      ? 'The customer’s details on every job you’re invited to, first refusal on new jobs in your area and 5% commission on prices sent through us.'
      : membership === 'premium'
        ? 'First refusal on new jobs in your area and 5% commission on your prices.'
        : suspended
          ? 'Join and your account is restored straight away: first refusal on new jobs in your area and 5% commission instead of 15%, from £20 a month.'
          : pending
            ? 'First refusal on new jobs in your area and 5% commission instead of 15%, from £20 a month. You can join now; it starts the moment we approve you.'
            : 'First refusal on new jobs in your area and 5% commission instead of 15%, from £20 a month. Open adds the customer’s details on every job.';

  return (
    <Link id="premium" href="/account/membership" prefetch={false} className={`${ac.subCard} ${ac.subLink}`}>
      <span className={ac.subHead}>
        <span className={ac.subTitle}>Membership</span>
        <span className={`${ac.subPill} ${member ? ac.subActive : ac.subInactive}`}>
          {member ? `${name} member` : 'From £20 a month'}
        </span>
      </span>
      {notice === 'success' && (
        <span className={ac.subNotice}>
          <b>Thanks — you’re in.</b> It can take a minute for Stripe to confirm.
        </span>
      )}
      {notice === 'changed' && (
        <span className={ac.subNotice}>
          <b>Done — your membership has changed.</b>
        </span>
      )}
      {notice === 'cancelled' && <span className={ac.subNotice}>No payment was taken.</span>}
      {notice === 'unconfigured' && (
        <span className={ac.subNotice}>Sign-up isn’t available just now. Please try again later.</span>
      )}
      <span className={ac.subBody}>
        {status && <b>{status}</b>}
        {status ? ' ' : ''}
        {benefit}
      </span>
      <span className={ac.subCta}>{member ? 'Manage membership' : 'See the plans and join'} →</span>
    </Link>
  );
}
