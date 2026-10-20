import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  annualSaving as saving,
  billedTier,
  isLiveSub,
  membershipDay as day,
  MEMBERSHIP_NAMES as NAME,
  priceLabel as label,
  subPlan,
  type Membership,
  type MembershipPlan as Plan,
  type MembershipTier as Tier,
  type SubRow as Sub,
} from '@/lib/membership';
import {
  ActionCurrent,
  ActionNote,
  Benefits,
  gbp,
  OPEN_BENEFITS,
  PREMIUM_BENEFITS,
  TierCard,
  TierGrid,
} from '@/components/membership/TierCard';
import f from '@/components/forms/forms.module.css';
import s from './membership.module.css';

/** A Stripe button: checkout or portal, with the page to come back to. */
function Pay({
  action,
  tier,
  plan,
  returnPath,
  className,
  children,
}: {
  action: 'checkout' | 'portal';
  tier?: Tier;
  plan?: Plan;
  returnPath: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <form action={`/api/stripe/${action}`} method="post">
      <input type="hidden" name="return" value={returnPath} />
      {tier && <input type="hidden" name="tier" value={tier} />}
      {plan && <input type="hidden" name="plan" value={plan} />}
      <button className={className} type="submit">{children}</button>
    </form>
  );
}

/**
 * The free plan as a card beside the two tiers, so the page shows what you
 * get for nothing next to what you get for £20 and £49, rather than leaving
 * the free contractor to work out what the tiers are being compared with.
 *
 *   free   → theirs: "Your plan", no button;
 *   billed → the way back is cancelling in the billing portal, so the card
 *            points at Manage billing rather than selling a £0 checkout;
 *   comped → nothing to cancel: free is what is left when the comp ends.
 */
function FreeCard({ state, forever = false }: { state: 'free' | 'billed' | 'comped'; forever?: boolean }) {
  const mine = state === 'free';
  return (
    <TierCard tier="free" current={mine} tag={mine ? 'Your plan' : undefined}>
      {mine ? (
        <ActionCurrent>Your plan — free</ActionCurrent>
      ) : state === 'billed' ? (
        <ActionNote>To go back to the free plan, use <b>Manage billing or cancel</b> above.</ActionNote>
      ) : forever ? (
        <ActionNote>Your membership is on us for good, so there’s nothing to cancel.</ActionNote>
      ) : (
        <ActionNote>This is what’s left when your membership on us ends. Nothing to cancel.</ActionNote>
      )}
    </TierCard>
  );
}

/**
 * Where a tier card stands for this contractor:
 *   free     → not a member, both cards say "Join";
 *   billed   → the tier Stripe bills, with its plan: "Your plan", and the
 *              other plan as a switch;
 *   comped   → a tier they hold on us: "Yours, on us", nothing to pay;
 *   other    → a tier they could take: a move when something is billed, a
 *              join when nothing is. A tier below one they hold on us is
 *              `outranked`: paying for it would change nothing, so no buttons.
 */
type TierState =
  | { kind: 'free' }
  | { kind: 'billed'; plan: Plan }
  | { kind: 'comped' }
  | { kind: 'other'; plan: Plan | null; outranked: boolean };

function PaidCard({ tier, state, returnPath }: { tier: Tier; state: TierState; returnPath: string }) {
  const mine = state.kind === 'billed' || state.kind === 'comped';
  const primary = tier === 'open' ? f.btnYellow : f.btnPrimary;

  let buttons: ReactNode;
  if (state.kind === 'comped') {
    buttons = <ActionNote>Nothing to pay while it’s on us.</ActionNote>;
  } else if (state.kind === 'other' && state.outranked) {
    buttons = <ActionNote>You already have all of this, and more, on us.</ActionNote>;
  } else if (state.kind === 'billed') {
    const swap: Plan = state.plan === 'monthly' ? 'annual' : 'monthly';
    buttons = (
      <>
        <ActionCurrent>Your plan — {label(tier, state.plan)}</ActionCurrent>
        <Pay action="checkout" tier={tier} plan={swap} returnPath={returnPath} className={f.btnGhost}>
          Switch to {label(tier, swap)}
          {swap === 'annual' ? `, save ${gbp(saving(tier))}` : ''}
        </Pay>
      </>
    );
  } else {
    // Lead with the plan they're on, so a move keeps their billing rhythm.
    const lead: Plan = state.kind === 'other' && state.plan ? state.plan : 'monthly';
    const alt: Plan = lead === 'monthly' ? 'annual' : 'monthly';
    const verb = state.kind === 'other' && state.plan ? `Move to ${NAME[tier]}` : 'Join';
    buttons = (
      <>
        <Pay action="checkout" tier={tier} plan={lead} returnPath={returnPath} className={primary}>
          {verb} — {label(tier, lead)}
        </Pay>
        <Pay action="checkout" tier={tier} plan={alt} returnPath={returnPath} className={f.btnGhost}>
          {verb} — {label(tier, alt)}
        </Pay>
      </>
    );
  }

  return (
    <TierCard
      tier={tier}
      current={mine}
      tag={mine ? (state.kind === 'comped' ? 'Yours, on us' : 'Your plan') : undefined}
    >
      {buttons}
    </TierCard>
  );
}

/**
 * The membership page's body. Three shapes:
 *
 *   free plan  → the lead, the free plan and the two tiers side by side, how first refusal
 *                works, the fine print;
 *   member     → their plan card (tier, price, renewal, billing), then all
 *                three again under "Change your plan", theirs marked, so a
 *                move up, down or to yearly is one button;
 *   comped     → the plan card with "on us" in place of a price, and the
 *                same change section.
 *
 * The pitch and the sums are the dashboard panel's; only the shape is new.
 */
export function MembershipView({
  membership,
  sub,
  compedUntil,
  openCompedUntil,
  notice,
  pending,
  suspended,
  canChange,
  returnPath,
}: {
  /** The tier they have, as the dashboard badge reads it (membershipOf). */
  membership: Membership;
  sub: Sub;
  compedUntil: string | null;
  openCompedUntil: string | null;
  notice?: string;
  /** Application not yet approved: paid membership waits for approval. */
  pending: boolean;
  /** Suspended after approval and vetted: joining restores the account. */
  suspended: boolean;
  /** Approved: may move between tiers. Pending and suspended may only bill. */
  canChange: boolean;
  returnPath: string;
}) {
  const active = isLiveSub(sub);
  // What they have (an Open comp outranks a paid premium) and what Stripe
  // bills them for can differ; the header says the first, the price line
  // and the buttons go by the second.
  const member = membership !== null;
  const tier: Tier = membership ?? 'premium';
  const billed: Tier | null = billedTier(sub);
  const plan: Plan = subPlan(sub);
  const openComped = Boolean(openCompedUntil && new Date(openCompedUntil) > new Date());
  const until = openComped ? openCompedUntil : compedUntil;
  const forever = until ? new Date(until).getFullYear() >= 2099 : false;

  const noticeBox =
    notice === 'success' ? (
      <p className={s.notice}>
        <b>Thanks — you’re in.</b> It can take a minute for Stripe to confirm; refresh if this page
        still shows the join buttons{suspended ? ' or says your account is suspended' : ''}.
      </p>
    ) : notice === 'changed' ? (
      <p className={s.notice}>
        <b>Done — your membership has changed.</b> The difference is worked out from today and shows
        on your next invoice.
      </p>
    ) : notice === 'cancelled' ? (
      <p className={`${s.notice} ${s.noticeWarn}`}>No payment was taken. Join whenever you’re ready.</p>
    ) : notice === 'unconfigured' ? (
      <p className={`${s.notice} ${s.noticeWarn}`}>Sign-up isn’t available just now. Please try again later.</p>
    ) : null;

  // ── A member ──────────────────────────────────────────────────────────
  if (member) {
    const meta = billed ? (
      sub?.status === 'past_due' ? (
        <><b>Last payment failed</b> — Stripe will try again. Update your card below to keep it.</>
      ) : sub?.cancel_at_period_end && sub.current_period_end ? (
        <>Ends <b>{day(sub.current_period_end)}</b> and won’t renew.</>
      ) : (
        <>
          <b>{label(billed, plan)}</b>
          {billed !== tier ? <> for {NAME[billed]}</> : null}
          {sub?.current_period_end ? <> · renews {day(sub.current_period_end)}</> : null}
        </>
      )
    ) : (
      <>
        <b>On us</b>
        {!forever && until ? <> · until {day(until)}</> : null}
      </>
    );

    // Each card from both what Stripe bills and what they hold: a paid
    // Premium under an Open comp is "Your plan" on one card and "Yours, on
    // us" on the other, and nothing is sold that the comp already covers.
    const stateOf = (t: Tier): TierState => {
      if (t === billed) return { kind: 'billed', plan };
      if (t === tier) return { kind: 'comped' };
      return { kind: 'other', plan: billed ? plan : null, outranked: !billed && tier === 'open' };
    };

    return (
      <>
        {noticeBox}
        {pending && (
          <p className={s.notice}>
            {NAME[tier]} starts working the moment we approve your application. If we can’t approve
            it, we cancel your membership and refund you in full.
          </p>
        )}
        <section className={s.plan} aria-labelledby="plan-name">
          <div className={s.planHead}>
            <h2 id="plan-name" className={s.planName}>
              <span className={s.planStar} aria-hidden="true">{tier === 'open' ? '◆' : '★'}</span>
              {NAME[tier]} membership
            </h2>
            <div className={s.planMeta}>{meta}</div>
          </div>
          <div className={s.planBody}>
            <Benefits flush items={tier === 'open' ? [...OPEN_BENEFITS, ...PREMIUM_BENEFITS.slice(0, 2)] : PREMIUM_BENEFITS.slice(0, 2)} />
            {active && (
              <div className={s.planActions}>
                <Pay action="portal" returnPath={returnPath} className={f.btnGhost}>
                  Manage billing or cancel
                </Pay>
              </div>
            )}
          </div>
        </section>

        {canChange && (
          <section className={s.change} aria-labelledby="change-title">
            <h2 id="change-title" className={s.changeTitle}>Change your plan</h2>
            {billed && sub?.status !== 'active' ? (
              // A card being retried: Stripe would move the unpaid
              // subscription and the sync would grant the new tier before any
              // payment. Card first.
              <p className={s.changeText}>
                Update your card under <b>Manage billing</b> first; once the payment goes through you
                can move between plans here.
              </p>
            ) : (
              <>
                <p className={s.changeText}>
                  {billed && sub?.cancel_at_period_end && sub.current_period_end ? (
                    <>
                      Your membership ends on {day(sub.current_period_end)}. Picking any plan below
                      restarts it from today, prorated against what you’ve already paid.
                    </>
                  ) : billed ? (
                    <>
                      Move up, move down or switch between monthly and yearly whenever you like. A
                      change is prorated from today and shows on your next invoice; to cancel, use{' '}
                      <b>Manage billing</b> above.
                    </>
                  ) : (
                    <>
                      Your {NAME[tier]} membership is on us{!forever && until ? ` until ${day(until)}` : ''}, so
                      there’s nothing to change unless you want to. Anything you take out here is billed
                      from today.
                    </>
                  )}
                </p>
                <TierGrid>
                  <FreeCard state={billed ? 'billed' : 'comped'} forever={forever} />
                  {(['premium', 'open'] as const).map((t) => (
                    <PaidCard key={t} tier={t} returnPath={returnPath} state={stateOf(t)} />
                  ))}
                </TierGrid>
              </>
            )}
          </section>
        )}
      </>
    );
  }

  // ── The free plan ─────────────────────────────────────────────────────
  return (
    <>
      <p className={s.lead}>
        {suspended ? (
          <>
            <b>Join and your account is restored straight away.</b> It stays active for as long as
            you’re a member; if your membership ends, the account is suspended again.
          </>
        ) : pending ? (
          <>
            <b>You can join now.</b> Membership starts the moment we approve you, and if we can’t,
            we refund you in full.
          </>
        ) : (
          <>
            <b>New jobs come to members first, and your prices land cheaper.</b> Pick the tier that
            suits how you like to work.
          </>
        )}
      </p>
      {noticeBox}

      <TierGrid>
        <FreeCard state="free" />
        <PaidCard tier="premium" state={{ kind: 'free' }} returnPath={returnPath} />
        <PaidCard tier="open" state={{ kind: 'free' }} returnPath={returnPath} />
      </TierGrid>

      <section className={s.how} aria-labelledby="how-title">
        <h2 id="how-title" className={s.howTitle}>How first refusal works</h2>
        <ol className={s.steps}>
          <li className={s.step}>
            <b>A job comes in near you</b>
            Open members get the text first, Premium members up to 2 hours later, and everyone
            else after that. Tap it within 2 hours to show you’re interested.
          </li>
          <li className={s.step}>
            <b>Price it or message the customer</b>
            Within 24 hours. The job then stays with members until you’ve all priced or passed, or
            the week is up.
          </li>
          <li className={s.step}>
            <b>Nobody bites, it opens up</b>
            A text nobody taps in 2 hours counts as a pass; if nobody responds in 24 hours, the job
            goes to everyone.
          </li>
        </ol>
      </section>

      <p className={s.fine}>
        Customers see your price plus our commission, so 5% instead of 15% is the difference between
        winning on price and not. Cancel any time; you keep membership to the end of the period
        you’ve paid for. The details are in{' '}
        <Link href="/terms">clause 12 of the contractor terms</Link>.
      </p>
    </>
  );
}
