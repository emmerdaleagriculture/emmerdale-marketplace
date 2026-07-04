'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { CountyPicker, type CountyOption } from '@/components/forms/CountyPicker';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

export function SignupForm({
  counties,
  services,
}: {
  counties: CountyOption[];
  services: ServiceOption[];
}) {
  const [state, action, pending] = useActionState(signUpAction, emptyFormState);

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16 }}>
          {state.message}
        </p>
        <div className={a.altLink}>
          <Link href="/login">Go to log in →</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.groupTitle}>Your login</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Email</span>
          <input className={f.input} type="email" name="email" required autoComplete="email" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Password</span>
          <input
            className={f.input}
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      </div>

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

      <div className={a.groupTitle}>Services you offer</div>
      <ServicePicker services={services} />

      <div className={a.groupTitle}>Counties you cover</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        You’ll be notified about jobs in the counties you select. Use “Select all”
        to add a whole region at once.
      </p>
      <CountyPicker counties={counties} />

      <div className={a.groupTitle}>Agreement</div>
      <label className={f.checkRow}>
        <input type="checkbox" name="accept" />
        <span>
          I accept the{' '}
          <Link href="/terms" target="_blank">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" target="_blank">
            privacy policy
          </Link>
          , including the obligation to use customer details solely for responding
          to the specific enquiry.
        </span>
      </label>

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Join the network'}
        </button>
        <span className={a.altLink}>
          Already registered? <Link href="/login">Log in</Link>
        </span>
      </div>
    </form>
  );
}
