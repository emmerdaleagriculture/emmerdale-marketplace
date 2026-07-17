'use client';

import { useActionState } from 'react';
import { updateProfileAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { CountyPicker, type CountyOption } from '@/components/forms/CountyPicker';
import type { Contractor } from '@/lib/auth';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

export function AccountForm({
  contractor,
  counties,
  selectedCounties,
}: {
  contractor: Contractor;
  counties: CountyOption[];
  selectedCounties: number[];
}) {
  const [state, action, pending] = useActionState(updateProfileAction, emptyFormState);

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && <p className={f.success}>{state.message}</p>}

      <div className={a.groupTitle}>Your business</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Business name</span>
          <input className={f.input} name="business_name" defaultValue={contractor.business_name} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Contact name</span>
          <input className={f.input} name="contact_name" defaultValue={contractor.contact_name} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} name="phone" type="tel" defaultValue={contractor.phone} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Base postcode</span>
          <input className={f.input} name="base_postcode" defaultValue={contractor.base_postcode} required />
        </label>
      </div>

      <div className={a.groupTitle}>Counties you cover</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        Changes take effect immediately for future job notifications.
      </p>
      <CountyPicker counties={counties} selected={selectedCounties} />

      <div className={a.groupTitle}>Notifications</div>
      <label className={f.checkRow}>
        <input type="checkbox" name="notify_new_jobs" defaultChecked={contractor.notify_new_jobs} />
        <span>Email me when a new job is posted in one of my counties.</span>
      </label>

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
