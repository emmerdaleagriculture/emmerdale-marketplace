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
  const tier = TIER_OF[membership];

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
    <form action={action}>
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
          <span className={f.hint}>For our records only — not used to match jobs.</span>
        </label>
      </div>

      <div className={a.groupTitle}>What work do you do?</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        Everything starts ticked — untick anything you don&rsquo;t do. You can
        change them any time.
      </p>
      {/* All on by default (2026-09-23): jobs reach every contractor in the
          county regardless, and a narrow first pick mostly meant work a
          contractor does, like fencing, was simply never ticked. */}
      <ServicePicker services={services} selected={services.map((s) => s.id)} />

      <div className={a.groupTitle}>Counties you cover</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        You’ll be notified about jobs in the counties you select. Use “Select all”
        to add a whole region at once.
      </p>
      <CountyPicker counties={counties} />

      <div className={a.groupTitle}>Choose your membership</div>
      <p className={f.hint} style={{ marginBottom: 16 }}>
        New jobs come to members first, and their prices land cheaper. Start free if you like —
        you can move up any time from your account.
      </p>
      {/* The same three cards as /account/membership, with a pick in the
          foot instead of a Stripe button. The whole card selects its tier. */}
      <div role="radiogroup" aria-label="Membership">
        <TierGrid>
          <TierCard tier="free" current={tier === 'free'} tag={tier === 'free' ? 'Your pick' : undefined} onSelect={() => setMembership('free')}>
            {pick('free', 'Start free')}
          </TierCard>
          <TierCard tier="premium" current={tier === 'premium'} tag={tier === 'premium' ? 'Your pick' : undefined} onSelect={() => setMembership('monthly')}>
            {pick('monthly', `£${MEMBERSHIP_PRICES.premium.monthly} a month`)}
            {pick('annual', <>£{MEMBERSHIP_PRICES.premium.annual} a year — <b>save £{annualSaving('premium')}</b></>)}
          </TierCard>
          <TierCard tier="open" current={tier === 'open'} tag={tier === 'open' ? 'Your pick' : undefined} onSelect={() => setMembership('open_monthly')}>
            {pick('open_monthly', `£${MEMBERSHIP_PRICES.open.monthly} a month`)}
            {pick('open_annual', <>£{MEMBERSHIP_PRICES.open.annual} a year — <b>save £{annualSaving('open')}</b></>)}
          </TierCard>
        </TierGrid>
      </div>
      {membership !== 'free' && (
        <p className={f.hint}>
          You’ll pay securely with Stripe next. Membership starts working the moment we approve you,
          usually within a few hours. If we can’t approve your application, we cancel it and refund
          you in full. Cancel any time after that; see{' '}
          <a href="/terms" target="_blank" style={{ textDecoration: 'underline' }}>clause 12 of the contractor terms</a>.
        </p>
      )}

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending
            ? 'Saving…'
            : membership === 'free'
              ? 'Finish and submit application'
              : `Submit and pay £${PAY[membership]}`}
        </button>
      </div>
    </form>
  );
}

/** The form's value: the action reads tier and plan out of it (actions.ts). */
type Choice = 'free' | 'monthly' | 'annual' | 'open_monthly' | 'open_annual';
const TIER_OF: Record<Choice, 'free' | 'premium' | 'open'> = {
  free: 'free',
  monthly: 'premium',
  annual: 'premium',
  open_monthly: 'open',
  open_annual: 'open',
};
const PAY: Record<Choice, number> = {
  free: 0,
  monthly: MEMBERSHIP_PRICES.premium.monthly,
  annual: MEMBERSHIP_PRICES.premium.annual,
  open_monthly: MEMBERSHIP_PRICES.open.monthly,
  open_annual: MEMBERSHIP_PRICES.open.annual,
};
