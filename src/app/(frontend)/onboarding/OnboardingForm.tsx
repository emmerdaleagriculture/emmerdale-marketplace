'use client';

import { useActionState } from 'react';
import { completeOnboardingAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { CountyPicker, type CountyOption } from '@/components/forms/CountyPicker';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

export function OnboardingForm({
  counties,
  services,
}: {
  counties: CountyOption[];
  services: ServiceOption[];
}) {
  const [state, action, pending] = useActionState(completeOnboardingAction, emptyFormState);

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

      <div className={a.groupTitle}>Services you offer</div>
      <ServicePicker services={services} />

      <div className={a.groupTitle}>Counties you cover</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        You’ll be notified about jobs in the counties you select. Use “Select all”
        to add a whole region at once.
      </p>
      <CountyPicker counties={counties} />

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Finish and submit application'}
        </button>
      </div>
    </form>
  );
}
