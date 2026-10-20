import Link from 'next/link';
import {
  billedTier,
  MEMBERSHIP_NAMES,
  membershipDay,
  priceLabel,
  subPlan,
  type Membership,
  type SubRow as Sub,
} from '@/lib/membership';
import ac from './account.module.css';

/**
 * Membership on the dashboard: one card, and the whole card is the link to
 * /account/membership, where the plans, the buttons and Stripe's billing
 * portal live. It says what they have (or what they'd get) and the next
 * thing that matters: a renewal date, a failed payment, an ending plan.
 *
 * In the app (`app`) it is a plain card, not a link: what they have, or
 * what members get, with no price, no "join", and no mention of the
 * website. Apple's 3.1.1 bars an app outside the US from selling a
 * membership, or pointing people anywhere else to buy one, except through
 * Apple's own payments; membership is bought and managed on the website.
 */
export function MembershipCard({
  membership,
  sub,
  compedUntil,
  openCompedUntil,
  notice,
  pending = false,
  suspended = false,
  app = false,
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
  /** Account suspended: a non-member joining restores it; a member's
   *  benefits are paused, but their billing still runs. */
  suspended?: boolean;
  /** App mode: no link, no price, no call to action (store rules). */
  app?: boolean;
}) {
  const member = membership !== null;
  const billed = billedTier(sub);
  const plan = subPlan(sub);
  const name = member ? MEMBERSHIP_NAMES[membership] : null;
  const until = membership === 'open' ? openCompedUntil : compedUntil;
  const onUsUntil =
    !billed && until && new Date(until).getFullYear() < 2099 ? ` until ${membershipDay(until)}` : '';

  let status: React.ReactNode;
  if (member && billed && sub?.status === 'past_due') {
    status = (
      <>
        <b>Your last payment didn’t go through.</b> Stripe will try again. Update your card to keep
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
    : suspended && member
      ? 'Your account is suspended, so membership isn’t working just now. You can still manage your billing, or get in touch.'
    : membership === 'open'
      ? 'The customer’s details on every job you’re invited to, first refusal on new jobs in your area and 5% commission on prices sent through us.'
      : membership === 'premium'
        ? 'First refusal on new jobs in your area and 5% commission on your prices.'
        : suspended
          ? 'Join and your account is restored straight away: first refusal on new jobs in your area and 5% commission instead of 15%, from £20 a month.'
          : pending
            ? 'First refusal on new jobs in your area and 5% commission instead of 15%, from £20 a month. You can join now; it starts the moment we approve you.'
            : 'First refusal on new jobs in your area and 5% commission instead of 15%, from £20 a month. Open adds first look ahead of Premium, the customer’s details on every job, a listing in Find a contractor and market data for your area.';

  if (app) {
    // A member's status without the price or a "update your card": the
    // renewal or end date, or a failed payment as a fact. A free contractor
    // gets the benefits and nothing about joining, restoring or paying.
    let appStatus: React.ReactNode = null;
    if (member && billed && sub?.status === 'past_due') {
      appStatus = <>Your last payment didn’t go through. Stripe will try again.</>;
    } else if (member && billed && sub?.cancel_at_period_end && sub.current_period_end) {
      appStatus = status;
    } else if (member && billed && sub?.current_period_end) {
      appStatus = <>Renews {membershipDay(sub.current_period_end)}.</>;
    } else if (member && !billed) {
      appStatus = status;
    }
    const appBenefit = member && suspended
      ? 'Your account is suspended, so membership isn’t working just now. Please get in touch.'
      : member
      ? benefit
      : 'Members get first refusal on new jobs in their area and 5% commission instead of 15%. Open adds first look ahead of Premium, the customer’s details on every job, a listing in Find a contractor and market data for their area.';
    return (
      <div id="premium" className={ac.subCard}>
        <span className={ac.subHead}>
          <span className={ac.subTitle}>Membership</span>
          <span className={`${ac.subPill} ${member ? ac.subActive : ac.subInactive}`}>
            {member ? `${name} member` : 'Free plan'}
          </span>
        </span>
        <span className={ac.subBody}>
          {appStatus && <b>{appStatus}</b>}
          {appStatus ? ' ' : ''}
          {appBenefit}
        </span>
      </div>
    );
  }

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
          <b>Thanks, you’re in.</b> It can take a minute for Stripe to confirm.
        </span>
      )}
      {notice === 'changed' && (
        <span className={ac.subNotice}>
          <b>Done. Your membership has changed.</b>
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
