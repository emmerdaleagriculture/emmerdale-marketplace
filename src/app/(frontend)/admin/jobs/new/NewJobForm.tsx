'use client';

import { useActionState } from 'react';
import { createJobAction, type JobFormState } from './actions';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import type { CountyOption } from '@/components/forms/CountyPicker';
import f from '@/components/forms/forms.module.css';
import a from '../../../auth.module.css';

export type JobFormDefaults = {
  customer_name?: string;
  customer_first_name?: string;
  customer_phone?: string;
  customer_email?: string;
  postcode?: string;
  title?: string;
  description?: string;
  service_ids?: number[];
  county_id?: number;
};

export function NewJobForm({
  services,
  counties,
  defaults = {},
  leadId,
}: {
  services: ServiceOption[];
  counties: CountyOption[];
  defaults?: JobFormDefaults;
  leadId?: string;
}) {
  const [state, action, pending] = useActionState(createJobAction, {} as JobFormState);

  // On error the action echoes back what was submitted; re-seed the fields from
  // it so React 19's automatic post-action form reset doesn't wipe the page.
  const v = state.values;

  // Group counties by region for the manual-override dropdown.
  const regions = new Map<string, CountyOption[]>();
  for (const c of counties) {
    if (!regions.has(c.region)) regions.set(c.region, []);
    regions.get(c.region)!.push(c);
  }

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}

      <div className={a.groupTitle}>Customer (private — never shown until claimed)</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Customer full name</span>
          <input className={f.input} name="customer_name" required defaultValue={v?.customer_name ?? defaults.customer_name} />
          <span className={f.hint}>Private — surname is never shown publicly.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>First name (shown publicly)</span>
          <input className={f.input} name="customer_first_name" defaultValue={v?.customer_first_name ?? defaults.customer_first_name} />
          <span className={f.hint}>Appears on the public listing, e.g. “for Sarah”.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>Customer phone</span>
          <input className={f.input} name="customer_phone" required defaultValue={v?.customer_phone ?? defaults.customer_phone} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Customer email (optional)</span>
          <input className={f.input} name="customer_email" type="email" defaultValue={v?.customer_email ?? defaults.customer_email} />
        </label>
      </div>

      <div className={a.groupTitle}>Job</div>
      <label className={f.field}>
        <span className={f.label}>Title</span>
        <input className={f.input} name="title" required placeholder="e.g. Paddock topping — 6 acres" defaultValue={v?.title ?? defaults.title} />
      </label>
      <label className={f.field}>
        <span className={f.label}>Description</span>
        <textarea className={f.textarea} name="description" required defaultValue={v?.description ?? defaults.description} />
      </label>

      <div className={a.groupTitle}>Services needed</div>
      <ServicePicker services={services} selected={v?.service_ids ?? defaults.service_ids} />

      <div className={a.groupTitle}>Location &amp; timing</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Postcode</span>
          <input className={f.input} name="postcode" required placeholder="SO23 9XX" defaultValue={v?.postcode ?? defaults.postcode} />
          <span className={f.hint}>County is auto-detected. Full postcode stays private.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>County (override — leave blank to auto-detect)</span>
          {/* Keyed: a select only applies defaultValue at mount, so remount it
              when the echoed-back choice changes. */}
          <select
            key={v?.county_override ?? 'initial'}
            className={f.input}
            name="county_override"
            defaultValue={v?.county_override ?? defaults.county_id ?? ''}
          >
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
          <input className={f.input} name="budget_hint" placeholder="e.g. £300–£450" defaultValue={v?.budget_hint} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Paid head-start (hours)</span>
          <input className={f.input} name="exclusive_hours" type="number" min="0" max="72" defaultValue={v?.exclusive_hours ?? '0'} />
          <span className={f.hint}>
            Leave at 0 while the paid tier is shelved — a head start hides the job
            from the whole network until it opens, and there are no paid members
            to see it early.
          </span>
        </label>
      </div>

      <div className={a.groupTitle}>Consent (required)</div>
      <label className={f.checkRow}>
        <input type="checkbox" name="consent" defaultChecked={v?.consent} />
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
