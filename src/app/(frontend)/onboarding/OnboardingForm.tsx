'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { completeOnboardingAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { CountyPicker, type CountyOption } from '@/components/forms/CountyPicker';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import { TierCard, TierGrid } from '@/components/membership/TierCard';
import { MEMBERSHIP_PRICES, annualSaving } from '@/lib/membership';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';
import o from './onboarding.module.css';

export function OnboardingForm({
  counties,
  services,
  verifiedPhone = null,
}: {
  counties: CountyOption[];
  services: ServiceOption[];
  /** A number already verified by text in the app: shown, not asked for again. */
  verifiedPhone?: string | null;
}) {
  const [state, action, pending] = useActionState(completeOnboardingAction, emptyFormState);
  const [membership, setMembership] = useState<Choice>('free');
  /** Services start unticked and counties too, and a checkbox group can't be
   *  `required`, so the form checks both here rather than sending the
   *  server's error to the top of a long page (and React's post-action
   *  reset clearing everything typed). Once a submit has been tried, each
   *  message follows the boxes as they change, unticking included. */
  const [tried, setTried] = useState(false);
  const [noServices, setNoServices] = useState(false);
  const [noCounties, setNoCounties] = useState(false);
  const none = (root: ParentNode, name: string) => !root.querySelector(`input[name="${name}"]:checked`);
  const goTo = (id: string, name: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.focus({ preventScroll: true });
  };
  const tier = tierOf(membership);
  /** Clicking a card picks its monthly plan — unless it is already the pick,
   *  when a click on the blurb must not undo a yearly choice. */
  const select = (first: Choice) => () => {
    if (tierOf(first) !== tier) setMembership(first);
  };

  /** One radio in a card's foot. */
  const pick = (value: Choice, children: ReactNode) => (
    <label className={membership === value ? `${o.choice} ${o.choiceOn}` : o.choice}>
      <input
        type="radio"
        name="membership"
        value={value}
        checked={membership === value}
        onChange={() => setMembership(value)}
        className={o.choiceRadio}
      />
      <span>{children}</span>
    </label>
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const services = none(e.currentTarget, 'service_ids');
        const counties = none(e.currentTarget, 'county_ids');
        setTried(true);
        setNoServices(services);
        setNoCounties(counties);
        if (services || counties) {
          e.preventDefault();
          if (services) goTo('onboarding-services', 'service_ids');
          else goTo('onboarding-counties', 'county_ids');
        }
      }}
      onChange={(e) => {
        if (!tried) return;
        setNoServices(none(e.currentTarget, 'service_ids'));
        setNoCounties(none(e.currentTarget, 'county_ids'));
      }}
    >
      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.groupTitle}>Your business</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Business name</span>
          <input className={f.input} type="text" name="business_name" required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Contact name</span>
          <input className={f.input} type="text" name="contact_name" required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          {verifiedPhone ? (
            <>
              <input className={f.input} type="tel" name="phone" value={verifiedPhone} readOnly />
              <span className={f.hint}>Verified by text. Change it later from your account.</span>
            </>
          ) : (
            <input className={f.input} type="tel" name="phone" required autoComplete="tel" />
          )}
        </label>
        <label className={f.field}>
          <span className={f.label}>Base postcode</span>
          <input className={f.input} type="text" name="base_postcode" required />
          <span className={f.hint}>For our records only, not used to match jobs.</span>
        </label>
      </div>

      <div className={a.groupTitle} id="onboarding-services">What work do you do?</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        Tick the work you do: you&rsquo;ll only be sent jobs for these. You can
        change them any time.
      </p>
      {/* Nothing ticked to start (2026-11-05; all-on since 2026-09-23 had
          every new contractor claiming every service). Ticks route jobs for
          everyone since 20261105120000 (sq_contractor_wants_job); a job that
          can't be matched to a service still goes to them. */}
      {noServices && (
        <p className={f.error} role="alert" style={{ marginBottom: 12 }}>
          Pick at least one service.
        </p>
      )}
      <ServicePicker services={services} selected={[]} />

      <div className={a.groupTitle} id="onboarding-counties">Counties you cover</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        You’ll be notified about jobs in the counties you select. Use “Select all”
        to add a whole region at once.
      </p>
      {noCounties && (
        <p className={f.error} role="alert" style={{ marginBottom: 12 }}>
          Select at least one county.
        </p>
      )}
      {/* "Select all" ticks boxes without a change event, so it reports here. */}
      <CountyPicker counties={counties} onSelectAll={() => tried && setNoCounties(none(document, 'county_ids'))} />

      <div className={a.groupTitle}>Choose your membership</div>
      <p className={f.hint} style={{ marginBottom: 16 }}>
        New jobs come to members first, and their prices land cheaper. Start free if you like.
        You can move up any time from your account.
      </p>
      {/* The same three cards as /account/membership, with a pick in the
          foot instead of a Stripe button. The whole card selects its tier. */}
      <div role="radiogroup" aria-label="Membership">
        <TierGrid>
          <TierCard tier="free" current={tier === 'free'} tag={tier === 'free' ? 'Your pick' : undefined} onSelect={select('free')}>
            {pick('free', 'Start free')}
          </TierCard>
          <TierCard tier="premium" current={tier === 'premium'} tag={tier === 'premium' ? 'Your pick' : undefined} onSelect={select('monthly')}>
            {pick('monthly', `£${MEMBERSHIP_PRICES.premium.monthly} a month`)}
            {pick('annual', <>£{MEMBERSHIP_PRICES.premium.annual} a year, <b>save £{annualSaving('premium')}</b></>)}
          </TierCard>
          <TierCard tier="open" current={tier === 'open'} tag={tier === 'open' ? 'Your pick' : undefined} onSelect={select('open_monthly')}>
            {pick('open_monthly', `£${MEMBERSHIP_PRICES.open.monthly} a month`)}
            {pick('open_annual', <>£{MEMBERSHIP_PRICES.open.annual} a year, <b>save £{annualSaving('open')}</b></>)}
          </TierCard>
        </TierGrid>
      </div>
      <p className={f.hint} style={{ marginTop: -20, marginBottom: 16 }}>
        First refusal works like this: a new job near you comes to members by text first. Tap it
        within 2 hours and reply within 24, and the job stays with members for up to 7 days; miss
        either and it goes to everyone.
      </p>
      {membership !== 'free' && (
        <p className={f.hint}>
          You’ll pay securely with Stripe next. Membership starts working the moment we approve you,
          usually within a few hours. If we can’t approve your application, we cancel it and refund
          you in full. Cancel any time after that; see{' '}
          <a href="/terms" target="_blank" style={{ textDecoration: 'underline' }}>clause 12 of the contractor terms</a>.
        </p>
      )}

      <div className={`${a.actions} ${o.submit}`}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending
            ? 'Saving…'
            : membership === 'free'
              ? 'Finish and submit application'
              : `Submit and pay £${MEMBERSHIP_PRICES[tier === 'open' ? 'open' : 'premium'][planOf(membership)]}`}
        </button>
      </div>
    </form>
  );
}

/**
 * The form's value, read the same way actions.ts reads it: the open_ prefix
 * is the tier, the annual suffix the plan, and free is free.
 */
type Choice = 'free' | 'monthly' | 'annual' | 'open_monthly' | 'open_annual';
const tierOf = (c: Choice): 'free' | 'premium' | 'open' =>
  c === 'free' ? 'free' : c.startsWith('open_') ? 'open' : 'premium';
const planOf = (c: Choice): 'monthly' | 'annual' => (c.endsWith('annual') ? 'annual' : 'monthly');
