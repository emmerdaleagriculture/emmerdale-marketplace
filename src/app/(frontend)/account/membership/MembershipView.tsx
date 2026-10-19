import Link from 'next/link';
import type { ReactNode } from 'react';
import { siteUrl } from '@/lib/site';
import {
  annualSaving as saving,
  membershipDay as day,
  MEMBERSHIP_NAMES as NAME,
  MEMBERSHIP_PRICES as PRICE,
  priceLabel as label,
  type Membership,
  type MembershipPlan as Plan,
  type MembershipTier as Tier,
} from '@/lib/membership';
import f from '@/components/forms/forms.module.css';
import s from './membership.module.css';

type Sub = {
  status: string;
  plan: string | null;
  tier?: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null;

const gbp = (n: number) => `£${n}`;

function Tick() {
  return (
    <svg className={s.tick} viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

const PREMIUM_BENEFITS = [
  <><b>First refusal on new jobs</b> in your area, for up to 7 days before anyone else sees them.</>,
  <><b>5% commission instead of 15%.</b> Price a job at £400 and the customer sees £420, not £460.</>,
  <><b>Cancel any time.</b> You keep it to the end of the period you’ve paid for.</>,
];
const OPEN_BENEFITS = [
  <><b>The customer’s name, phone and email</b> on every job you’re invited to, the moment it arrives.</>,
  <><b>Agree the work directly</b> with nothing added on top — or send a price through us at 5% as usual.</>,
];

function Benefits({ items, plus }: { items: ReactNode[]; plus?: string }) {
  return (
    <ul className={s.benefits}>
      {plus && <li className={s.plus}>{plus}</li>}
      {items.map((b, i) => (
        <li key={i} className={s.benefit}>
          <Tick />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

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
 * The membership page's body. Three shapes:
 *
 *   free plan  → the lead, two tier cards side by side, how first refusal
 *                works, the fine print;
 *   member     → their plan card (tier, price, renewal, billing), then the
 *                other tier as an offer;
 *   comped     → the plan card with "on us" in place of a price.
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
  const active = sub?.status === 'active' || sub?.status === 'past_due';
  // What they have (an Open comp outranks a paid premium) and what Stripe
  // bills them for can differ; the header says the first, the price line
  // and the buttons go by the second.
  const member = membership !== null;
  const tier: Tier = membership ?? 'premium';
  const billed: Tier | null = active ? (sub?.tier === 'open' ? 'open' : 'premium') : null;
  const plan: Plan = sub?.plan === 'annual' ? 'annual' : 'monthly';
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
            <Benefits items={tier === 'open' ? [...OPEN_BENEFITS, ...PREMIUM_BENEFITS.slice(0, 2)] : PREMIUM_BENEFITS.slice(0, 2)} />
            {active && (
              <>
                <div className={s.planActions} data-app-hide>
                  <Pay action="portal" returnPath={returnPath} className={f.btnGhost}>
                    Manage billing
                  </Pay>
                  {billed === 'open' && canChange && (
                    <Pay action="checkout" tier="premium" plan={plan} returnPath={returnPath} className={f.btnGhost}>
                      Move to Premium — {label('premium', plan)}
                    </Pay>
                  )}
                </div>
                <p className={s.fine} data-app-only style={{ margin: '16px 0 0' }}>
                  Billing is managed on the website.
                </p>
              </>
            )}
          </div>
        </section>

        {billed === 'premium' && !openComped && canChange && (
          <section className={s.offer} aria-label="Move to Open">
            <div>
              <h2 className={s.offerTitle}>◆ Open — the customer’s details on every job</h2>
              <p className={s.offerText}>
                Everything in Premium, plus the customer’s name, phone number and email the moment a
                job arrives. Ring them and agree the work directly. Moving is prorated from today.
              </p>
            </div>
            <div data-app-hide>
              <Pay action="checkout" tier="open" plan={plan} returnPath={returnPath} className={f.btnPrimary}>
                Move to Open — {label('open', plan)}
              </Pay>
            </div>
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

      <div className={s.tiers}>
        <article className={s.tier} aria-labelledby="tier-premium">
          <h2 id="tier-premium" className={s.tierName}>★ Premium</h2>
          <p className={s.tierBlurb}>First look at every job in your area, and 5% commission instead of 15%.</p>
          <p className={s.price}>
            <span className={s.priceAmount}>{gbp(PRICE.premium.monthly)}</span>
            <span className={s.pricePer}>a month</span>
          </p>
          <p className={s.priceAlt}>
            or {gbp(PRICE.premium.annual)} a year — <b>save {gbp(saving('premium'))}</b>
          </p>
          <Benefits items={PREMIUM_BENEFITS} />
          <div className={s.actions} data-app-hide>
            <Pay action="checkout" tier="premium" plan="monthly" returnPath={returnPath} className={f.btnPrimary}>
              Join monthly — {gbp(PRICE.premium.monthly)}
            </Pay>
            <Pay action="checkout" tier="premium" plan="annual" returnPath={returnPath} className={f.btnGhost}>
              Join yearly — {gbp(PRICE.premium.annual)}
            </Pay>
          </div>
        </article>

        <article className={`${s.tier} ${s.tierFeatured}`} aria-labelledby="tier-open">
          <span className={s.tierTag}>Deal direct</span>
          <h2 id="tier-open" className={s.tierName}>◆ Open</h2>
          <p className={s.tierBlurb}>Everything in Premium, plus the customer’s contact details on every job.</p>
          <p className={s.price}>
            <span className={s.priceAmount}>{gbp(PRICE.open.monthly)}</span>
            <span className={s.pricePer}>a month</span>
          </p>
          <p className={s.priceAlt}>
            or {gbp(PRICE.open.annual)} a year — <b>save {gbp(saving('open'))}</b>
          </p>
          <Benefits plus="Everything in Premium, plus" items={OPEN_BENEFITS} />
          <div className={s.actions} data-app-hide>
            <Pay action="checkout" tier="open" plan="monthly" returnPath={returnPath} className={f.btnYellow}>
              Join monthly — {gbp(PRICE.open.monthly)}
            </Pay>
            <Pay action="checkout" tier="open" plan="annual" returnPath={returnPath} className={f.btnGhost}>
              Join yearly — {gbp(PRICE.open.annual)}
            </Pay>
          </div>
        </article>
      </div>

      {/* Store rules: no selling inside the app, or Apple and Google take
          their cut. The benefits show; joining happens on the website. */}
      <p className={s.fine} data-app-only>
        Membership is bought on the website: sign in at {siteUrl().replace(/^https?:\/\//, '')}/account/membership.
      </p>

      <section className={s.how} aria-labelledby="how-title">
        <h2 id="how-title" className={s.howTitle}>How first refusal works</h2>
        <ol className={s.steps}>
          <li className={s.step}>
            <b>A job comes in near you</b>
            Members get the text before anyone else. Tap it within 2 hours to show you’re interested.
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
