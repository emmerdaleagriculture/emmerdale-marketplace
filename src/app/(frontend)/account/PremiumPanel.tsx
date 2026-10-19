import Link from 'next/link';
import { siteUrl } from '@/lib/site';
import f from '@/components/forms/forms.module.css';
import ac from './account.module.css';

type Sub = {
  status: string;
  plan: string | null;
  tier?: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

const PRICE: Record<'premium' | 'open', Record<'monthly' | 'annual', string>> = {
  premium: { monthly: '£20 a month', annual: '£199 a year' },
  open: { monthly: '£49 a month', annual: '£399 a year' },
};

/**
 * Membership on the dashboard: the pitch for the two tiers and their
 * buttons, or the member's own plan and a way to manage or change it. The
 * sums in the premium pitch are the point: the customer sees our price, so
 * 5% instead of 15% is the difference between winning on price and not.
 * Open (20261019120000) is premium plus the customer's details on every
 * invitation, to deal with them directly.
 */
export function PremiumPanel({
  sub,
  compedUntil,
  openCompedUntil = null,
  notice,
  pending = false,
  suspended = false,
}: {
  sub: Sub;
  compedUntil: string | null;
  openCompedUntil?: string | null;
  notice?: string;
  /** Application not yet approved: paid membership waits for approval. */
  pending?: boolean;
  /** Suspended after approval: joining restores the account. */
  suspended?: boolean;
}) {
  const active = sub?.status === 'active' || sub?.status === 'past_due';
  const openComped = !active && openCompedUntil && new Date(openCompedUntil) > new Date();
  const comped = !active && !openComped && compedUntil && new Date(compedUntil) > new Date();
  const tier: 'premium' | 'open' = active ? (sub?.tier === 'open' ? 'open' : 'premium') : openComped ? 'open' : 'premium';
  const plan: 'monthly' | 'annual' = sub?.plan === 'annual' ? 'annual' : 'monthly';
  const tierName = tier === 'open' ? 'Open' : 'Premium';

  return (
    <div id="premium" className={ac.subCard}>
      <div className={ac.subHead}>
        <span className={ac.subTitle}>Membership</span>
        <span className={`${ac.subPill} ${active || comped || openComped ? ac.subActive : ac.subInactive}`}>
          {active || comped || openComped ? `${tierName} member` : 'From £20 a month'}
        </span>
      </div>

      {notice === 'success' && (
        <p className={ac.subBody}>
          <b>Thanks — you’re in.</b> It can take a minute for Stripe to confirm; refresh if this
          still shows the sign-up buttons{suspended ? ' or says your account is suspended' : ''}.
        </p>
      )}
      {notice === 'changed' && (
        <p className={ac.subBody}>
          <b>Done — your membership has changed.</b> The difference is worked out from today and
          shows on your next invoice.
        </p>
      )}
      {notice === 'unconfigured' && (
        <p className={ac.subBody}>Sign-up isn’t available just now. Please try again later.</p>
      )}

      {active ? (
        <>
          <p className={ac.subBody}>
            {sub?.status === 'past_due' ? (
              <>
                <b>Your last payment didn’t go through.</b> Stripe will try again — update your card
                below to keep your membership.
              </>
            ) : sub?.cancel_at_period_end && sub.current_period_end ? (
              <>Your {tierName} membership ends on {day(sub.current_period_end)} and won’t renew.</>
            ) : (
              <>
                {tierName}, {PRICE[tier][plan]}
                {sub?.current_period_end ? `, renews ${day(sub.current_period_end)}` : ''}.
              </>
            )}{' '}
            {pending
              ? `${tierName} starts working the moment we approve your application. If we can’t approve it, we cancel your membership and refund you in full.`
              : tier === 'open'
                ? 'Every job you’re invited to shows the customer’s name, phone number and email straight away, so you can agree the work with them directly. New jobs still come to you before anyone else, and any price you send through us carries 5% commission instead of 15%.'
                : 'New jobs in your area come to you before anyone else — tap the text within 2 hours and reply within 24 to hold them for up to 7 days — and every price you send carries 5% commission instead of 15%.'}
          </p>
          <div className={ac.premiumButtons} data-app-hide>
            <form action="/api/stripe/portal" method="post">
              <button className={f.btnGhost} type="submit">
                Manage billing
              </button>
            </form>
            {tier === 'premium' && !pending && (
              <form action="/api/stripe/checkout" method="post">
                <input type="hidden" name="tier" value="open" />
                <input type="hidden" name="plan" value={plan} />
                <button className={f.btnYellow} type="submit">
                  Move to Open — {PRICE.open[plan]}
                </button>
              </form>
            )}
          </div>
          {tier === 'premium' && !pending && (
            <p className={ac.subBody}>
              <b>Open</b> adds the customer’s contact details on every job you’re invited to, the
              moment it arrives, so you can ring them and agree the work directly. Moving is
              prorated from today.
            </p>
          )}
          {tier === 'open' && !pending && (
            <p className={ac.subBody} data-app-hide>
              Rather go back to Premium?{' '}
              <form action="/api/stripe/checkout" method="post" style={{ display: 'inline' }}>
                <input type="hidden" name="tier" value="premium" />
                <input type="hidden" name="plan" value={plan} />
                <button className={ac.linkButton} type="submit">
                  Move to Premium, {PRICE.premium[plan]}
                </button>
              </form>
              .
            </p>
          )}
          <p className={ac.subBody} data-app-only>Billing is managed on the website.</p>
        </>
      ) : openComped ? (
        <p className={ac.subBody}>
          You have Open membership on us
          {new Date(openCompedUntil!).getFullYear() < 2099 ? ` until ${day(openCompedUntil!)}` : ''}: the
          customer’s details on every job you’re invited to, first refusal on new jobs in your
          area and 5% commission on prices sent through us.
        </p>
      ) : comped ? (
        <p className={ac.subBody}>
          You have premium on us
          {new Date(compedUntil!).getFullYear() < 2099 ? ` until ${day(compedUntil!)}` : ''}: first
          refusal on new jobs in your area and 5% commission on your prices.
        </p>
      ) : (
        <>
          <div className={ac.subBody}>
            <p>
              <b>Premium — first refusal for up to 7 days.</b> New jobs in your area come to
              members before anyone else. Tap the text within 2 hours, then price it or message
              the customer within 24, and it stays with members until you’ve all priced or
              passed, or the week is up. A text nobody taps in 2 hours counts as a pass; if nobody
              responds in 24 hours, it goes to everyone.
            </p>
            <p>
              <b>5% commission instead of 15%.</b> Customers see your price plus our commission, so
              yours lands cheaper. Price a job at £400 and the customer sees £420, not £460 — or
              charge more and still come in under everyone else.
            </p>
            <p>
              <b>Open — the customer’s details on every job.</b> Everything in Premium, and the
              customer’s name, phone number and email the moment a job arrives, before anyone
              has priced it. Ring them, agree the work and the price directly, with nothing
              added on top — or send a price through us at 5% as usual.
            </p>
            {suspended && (
              <p>
                <b>Join and your account is restored straight away</b>, with everything above. It
                stays active for as long as you&rsquo;re a member: if your membership ends, the
                account is suspended again.
              </p>
            )}
            {pending && (
              <p>
                You can join now: membership starts the moment we approve you, and if we can’t, we
                refund you in full.
              </p>
            )}
            <p>
              Cancel any time; you keep it to the end of the period you’ve paid for. The details
              are in <Link href="/terms">clause 12 of the contractor terms</Link>.
            </p>
          </div>
          {/* Store rules: no selling inside the app, or Apple and Google take
              their cut. The benefits show; joining happens on the website. */}
          <p className={ac.subBody} data-app-only>
            Membership is bought on the website: sign in at {siteUrl().replace(/^https?:\/\//, '')}/account.
          </p>
          <div className={ac.premiumButtons} data-app-hide>
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="tier" value="premium" />
              <input type="hidden" name="plan" value="monthly" />
              <button className={f.btnPrimary} type="submit">
                Premium £20 a month
              </button>
            </form>
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="tier" value="premium" />
              <input type="hidden" name="plan" value="annual" />
              <button className={f.btnPrimary} type="submit">
                Premium £199 a year — save £41
              </button>
            </form>
          </div>
          <div className={ac.premiumButtons} data-app-hide style={{ marginTop: 10 }}>
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="tier" value="open" />
              <input type="hidden" name="plan" value="monthly" />
              <button className={f.btnYellow} type="submit">
                Open £49 a month
              </button>
            </form>
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="tier" value="open" />
              <input type="hidden" name="plan" value="annual" />
              <button className={f.btnYellow} type="submit">
                Open £399 a year — save £189
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
