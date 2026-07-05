'use client';

import { useActionState } from 'react';
import { createJobAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import type { CountyOption } from '@/components/forms/CountyPicker';
import f from '@/components/forms/forms.module.css';
import a from '../../../auth.module.css';

export function NewJobForm({
  services,
  counties,
}: {
  services: ServiceOption[];
  counties: CountyOption[];
}) {
  const [state, action, pending] = useActionState(createJobAction, emptyFormState);

  // Group counties by region for the manual-override dropdown.
  const regions = new Map<string, CountyOption[]>();
  for (const c of counties) {
    if (!regions.has(c.region)) regions.set(c.region, []);
    regions.get(c.region)!.push(c);
  }

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.groupTitle}>Customer (private — never shown until award)</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Customer name</span>
          <input className={f.input} name="customer_name" required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Customer phone</span>
          <input className={f.input} name="customer_phone" required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Customer email (optional)</span>
          <input className={f.input} name="customer_email" type="email" />
        </label>
      </div>

      <div className={a.groupTitle}>Job</div>
      <label className={f.field}>
        <span className={f.label}>Title</span>
        <input className={f.input} name="title" required placeholder="e.g. Paddock topping — 6 acres" />
      </label>
      <label className={f.field}>
        <span className={f.label}>Description</span>
        <textarea className={f.textarea} name="description" required />
      </label>

      <div className={a.groupTitle}>Services needed</div>
      <ServicePicker services={services} />

      <div className={a.groupTitle}>Location &amp; timing</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Postcode</span>
          <input className={f.input} name="postcode" required placeholder="SO23 9XX" />
          <span className={f.hint}>County is auto-detected. Full postcode stays private.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>County (override — leave blank to auto-detect)</span>
          <select className={f.input} name="county_override" defaultValue="">
            <option value="">Auto-detect from postcode</option>
            {Array.from(regions.entries()).map(([region, list]) => (
              <optgroup key={region} label={region}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Budget hint (optional, public)</span>
          <input className={f.input} name="budget_hint" placeholder="e.g. £300–£450" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Paid head-start (hours)</span>
          <input className={f.input} name="exclusive_hours" type="number" min="0" max="72" defaultValue="12" />
          <span className={f.hint}>
            Paid members see it this many hours before bidding opens. 0 = open to
            bidding immediately.
          </span>
        </label>
        <label className={f.field}>
          <span className={f.label}>Bidding closes</span>
          <input className={f.input} name="closes_at" type="datetime-local" />
          <span className={f.hint}>Leave blank for 24h after the window opens.</span>
        </label>
      </div>

      <div className={a.groupTitle}>Consent (required)</div>
      <label className={f.checkRow}>
        <input type="checkbox" name="consent" />
        <span>
          The customer has consented to us passing their name and contact details
          to one or more vetted contractors in our network so they can contact the
          customer directly about this job (verbal or written, logged now).
        </span>
      </label>

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Posting…' : 'Post job to the network'}
        </button>
      </div>
    </form>
  );
}
