'use client';

import { useActionState } from 'react';
import { publishLeadAsSubmissionAction } from './actions';
import type { FormState } from '@/lib/form';
import type { ServiceOption } from '@/components/forms/ServicePicker';
import f from '@/components/forms/forms.module.css';
import a from '../../auth.module.css';

const EMPTY: FormState = {};

/**
 * Publish a reviewed lead into the sealed-quote flow.
 *
 * Replaces NewJobForm here, which posted to the legacy `jobs` board. Smaller
 * than that form because the sealed flow needs less: one service rather than
 * several (distribution matches on it), a county rather than a postcode (the
 * customer's postcode is not reliably the job's location), and no exclusivity
 * window — there are no paid subscribers for one to notify.
 */
export function PublishLeadForm({
  leadId,
  services,
  counties,
  defaults,
}: {
  leadId: string;
  services: ServiceOption[];
  counties: { id: number; name: string }[];
  defaults: {
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    details: string;
    service_id?: number;
    county_id?: number;
  };
}) {
  const [state, act, pending] = useActionState(publishLeadAsSubmissionAction, EMPTY);

  return (
    <form action={act}>
      <input type="hidden" name="lead_id" value={leadId} />
      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Customer name</span>
          <input className={f.input} name="customer_name" required defaultValue={defaults.customer_name} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} name="customer_phone" defaultValue={defaults.customer_phone} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Email</span>
          <input className={f.input} name="customer_email" type="email" defaultValue={defaults.customer_email} />
        </label>
        <label className={f.field}>
          <span className={f.label}>County</span>
          <select className={f.input} name="county_id" required defaultValue={defaults.county_id ?? ''}>
            <option value="">Pick one…</option>
            {counties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className={f.hint}>
            Contractors are matched on the county. No postcode is published.
          </span>
        </label>
      </div>

      <label className={f.field}>
        <span className={f.label}>Service</span>
        <select className={f.input} name="service_id" required defaultValue={defaults.service_id ?? ''}>
          <option value="">Pick one…</option>
          {services.map((sv) => (
            <option key={sv.id} value={sv.id}>
              {sv.name}
            </option>
          ))}
        </select>
        <span className={f.hint}>
          One only — this is what decides which contractors are invited to price it.
        </span>
      </label>

      <label className={f.field}>
        <span className={f.label}>The job, in the customer&rsquo;s words</span>
        <textarea className={f.textarea} name="details" required rows={4} defaultValue={defaults.details} />
        <span className={f.hint}>This is what a contractor reads on the quote page.</span>
      </label>

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
          {pending ? 'Publishing…' : 'Publish and invite contractors'}
        </button>
      </div>
    </form>
  );
}
