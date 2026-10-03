'use client';

import { useActionState, useState } from 'react';
import { completeOnboardingAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { CountyPicker, type CountyOption } from '@/components/forms/CountyPicker';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';
import o from './onboarding.module.css';

export function OnboardingForm({
  counties,
  services,
}: {
  counties: CountyOption[];
  services: ServiceOption[];
}) {
  const [state, action, pending] = useActionState(completeOnboardingAction, emptyFormState);
  const [membership, setMembership] = useState<'free' | 'monthly' | 'annual'>('free');

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
          <input className={f.input} type="tel" name="phone" required autoComplete="tel" />
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
      <div className={o.plans} role="radiogroup" aria-label="Membership">
        {PLANS.map((p) => (
          <label
            key={p.value}
            className={`${o.plan} ${membership === p.value ? o.planOn : ''} ${p.value !== 'free' ? o.planPremium : ''}`}
          >
            <input
              type="radio"
              name="membership"
              value={p.value}
              checked={membership === p.value}
              onChange={() => setMembership(p.value)}
              className={o.radio}
            />
            <span className={o.planName}>{p.name}</span>
            <span className={o.planPrice}>{p.price}</span>
            <span className={o.planNote}>{p.note}</span>
          </label>
        ))}
      </div>
      <ul className={o.perks}>
        <li>
          <b>Free:</b> jobs in your counties, first come, first served. We add 15% to your price.
        </li>
        <li>
          <b>Premium:</b> new jobs come to you up to <b>7 days before anyone else</b>, and we add
          only <b>5%</b> to your price, so a £400 price shows the customer £420, not £460.
        </li>
      </ul>
      {membership !== 'free' && (
        <p className={f.hint}>
          You’ll pay securely with Stripe next. Premium starts working the moment we approve you,
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
              : `Submit and pay ${membership === 'annual' ? '£199' : '£20'}`}
        </button>
      </div>
    </form>
  );
}

const PLANS = [
  { value: 'free', name: 'Free', price: '£0', note: '15% added to your prices' },
  { value: 'monthly', name: 'Premium', price: '£20 a month', note: '7-day first refusal · 5%' },
  { value: 'annual', name: 'Premium yearly', price: '£199 a year', note: 'Same as monthly · save £41' },
] as const;
