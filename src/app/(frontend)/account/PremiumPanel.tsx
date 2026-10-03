import f from '@/components/forms/forms.module.css';
import ac from './account.module.css';

type Sub = {
  status: string;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

/**
 * Premium membership on the dashboard: the pitch and two buttons, or the
 * member's own plan and a way to manage it. The sums in the pitch are the
 * point: the customer sees our price, so 5% instead of 15% is the difference
 * between winning on price and not.
 */
export function PremiumPanel({
  sub,
  compedUntil,
  notice,
  pending = false,
}: {
  sub: Sub;
  compedUntil: string | null;
  notice?: string;
  /** Application not yet approved: paid premium waits for approval. */
  pending?: boolean;
}) {
  const active = sub?.status === 'active' || sub?.status === 'past_due';
  const comped = !active && compedUntil && new Date(compedUntil) > new Date();

  return (
    <div id="premium" className={ac.subCard}>
      <div className={ac.subHead}>
        <span className={ac.subTitle}>Premium membership</span>
        <span className={`${ac.subPill} ${active || comped ? ac.subActive : ac.subInactive}`}>
          {active || comped ? 'Member' : '£20 a month'}
        </span>
      </div>

      {notice === 'success' && (
        <p className={ac.subBody}>
          <b>Thanks — you’re in.</b> It can take a minute for Stripe to confirm; refresh if this
          still shows the sign-up buttons.
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
              <>Your membership ends on {day(sub.current_period_end)} and won’t renew.</>
            ) : (
              <>
                {sub?.plan === 'annual' ? '£199 a year' : '£20 a month'}
                {sub?.current_period_end ? `, renews ${day(sub.current_period_end)}` : ''}.
              </>
            )}{' '}
            {pending
              ? 'Premium starts working the moment we approve your application. If we can’t approve it, we cancel your membership and refund you in full.'
              : 'New jobs in your area come to you before anyone else — reply within 24 hours to hold them for up to 7 days — and every price you send carries 5% commission instead of 15%.'}
          </p>
          <form action="/api/stripe/portal" method="post">
            <button className={f.btnGhost} type="submit">
              Manage billing
            </button>
          </form>
        </>
      ) : comped ? (
        <p className={ac.subBody}>
          You have premium on us until {day(compedUntil!)}: first refusal on new jobs in your area
          and 5% commission on your prices.
        </p>
      ) : (
        <>
          <div className={ac.subBody}>
            <p>
              <b>First refusal for up to 7 days.</b> New jobs in your area come to premium members
              before anyone else. Price it or message the customer within 24 hours and it stays with
              premium members until you’ve all priced or passed, or the week is up. If nobody
              responds in 24 hours, it goes to everyone.
            </p>
            <p>
              <b>5% commission instead of 15%.</b> Customers see your price plus our commission, so
              yours lands cheaper. Price a job at £400 and the customer sees £420, not £460 — or
              charge more and still come in under everyone else.
            </p>
            {pending && (
              <p>
                You can join now: premium starts the moment we approve you, and if we can’t, we
                refund you in full.
              </p>
            )}
            <p>
              Cancel any time; you keep it to the end of the period you’ve paid for. The details
              are in <a href="/terms">clause 12 of the contractor terms</a>.
            </p>
          </div>
          <div className={ac.premiumButtons}>
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="plan" value="monthly" />
              <button className={f.btnPrimary} type="submit">
                £20 a month
              </button>
            </form>
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="plan" value="annual" />
              <button className={f.btnYellow} type="submit">
                £199 a year — save £41
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
