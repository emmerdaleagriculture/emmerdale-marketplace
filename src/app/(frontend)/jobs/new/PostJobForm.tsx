'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { submitJobAction, type PostJobState } from './actions';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import type { CountyOption } from '@/components/forms/CountyPicker';
import f from '@/components/forms/forms.module.css';
import a from '../../auth.module.css';

export type PostJobDefaults = {
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
};

export function PostJobForm({
  services,
  counties,
  defaults = {},
}: {
  services: ServiceOption[];
  counties: CountyOption[];
  defaults?: PostJobDefaults;
}) {
  const [state, action, pending] = useActionState(submitJobAction, {} as PostJobState);

  if (state.ok) {
    return (
      <div>
        <p className={a.sub}>{state.message}</p>
        <div className={a.actions}>
          <Link href="/jobs" className={f.btnPrimary}>
            Back to the job board
          </Link>
        </div>
      </div>
    );
  }

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

      <div className={a.groupTitle}>The job</div>
      <label className={f.field}>
        <span className={f.label}>Title</span>
        <input className={f.input} name="title" required placeholder="e.g. Paddock topping — 6 acres" defaultValue={v?.title} />
      </label>
      <label className={f.field}>
        <span className={f.label}>Description</span>
        <textarea className={f.textarea} name="description" required defaultValue={v?.description} />
        <span className={f.hint}>
          What needs doing, roughly how much land, access, timing — whatever a
          contractor would want to know before calling.
        </span>
      </label>

      <div className={a.groupTitle}>Services needed</div>
      <ServicePicker services={services} selected={v?.service_ids} />

      <div className={a.groupTitle}>Location</div>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Postcode (optional if you pick a county)</span>
          <input className={f.input} name="postcode" placeholder="SO23 9XX" defaultValue={v?.postcode} />
          <span className={f.hint}>Auto-detects the county. The full postcode stays private.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>County</span>
          {/* Keyed: a select only applies defaultValue at mount, so remount it
              when the echoed-back choice changes. */}
          <select
            key={v?.county_override ?? 'initial'}
            className={f.input}
            name="county_override"
            defaultValue={v?.county_override ?? ''}
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
          <span className={f.hint}>
            Pick one to post without a postcode. A chosen county always wins over
            auto-detect.
          </span>
        </label>
        <label className={f.field}>
          <span className={f.label}>Budget hint (optional, public)</span>
          <input className={f.input} name="budget_hint" placeholder="e.g. £300–£450" defaultValue={v?.budget_hint} />
        </label>
      </div>

      <div className={a.groupTitle}>Who should contractors contact?</div>
      <p className={a.sub}>
        You, or the customer the work is for. Only shared with contractors who
        open the job — the listing shows a first name at most.
      </p>
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Contact name</span>
          <input className={f.input} name="contact_name" required defaultValue={v?.contact_name ?? defaults.contact_name} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Contact phone</span>
          <input className={f.input} name="contact_phone" required defaultValue={v?.contact_phone ?? defaults.contact_phone} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Contact email (optional)</span>
          <input className={f.input} name="contact_email" type="email" defaultValue={v?.contact_email ?? defaults.contact_email} />
        </label>
      </div>

      <div className={a.groupTitle}>Consent (required)</div>
      <label className={f.checkRow}>
        <input type="checkbox" name="consent" defaultChecked={v?.consent} />
        <span>
          The person named above (me, or my customer — with their agreement) is
          happy for their name and contact details to be shared with vetted
          contractors in the network so they can get in touch directly about
          this job.
        </span>
      </label>

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>
    </form>
  );
}
