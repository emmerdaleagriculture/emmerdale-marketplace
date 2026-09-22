'use client';

import { useActionState, useEffect, useState } from 'react';
import { publishLeadAsSubmissionAction, type PublishLeadState } from './actions';
import type { ServiceOption } from '@/components/forms/ServicePicker';
import f from '@/components/forms/forms.module.css';
import a from '../../auth.module.css';

const EMPTY: PublishLeadState = {};

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
    postcode: string;
    service_id?: number;
    county_id?: number;
  };
}) {
  const [state, act, pending] = useActionState(publishLeadAsSubmissionAction, EMPTY);
  // What the operator last typed wins over the lead's own values: React
  // resets the form when the action resolves, so a rejection would otherwise
  // throw away a rewritten description and re-seed it from the raw lead.
  const v = { ...defaults, ...(state.values ?? {}) } as typeof defaults & { consent?: boolean };
  // Remount the form on every rejection, so the fields pick up the echoed
  // values as their defaults.
  //
  // React calls form.reset() once the action resolves, and that runs AFTER
  // effects — so a <select value={…}> is wiped in the DOM with no further
  // render to put it back, and the next submit fails on "Pick the service
  // first" while the operator is looking at a form that appears filled in.
  // Measured, not assumed: formData carried service_id=1 into the action and
  // the select read "" afterwards. A fresh mount sidesteps reset entirely.
  const [mount, setMount] = useState(0);
  useEffect(() => {
    if (state.values) setMount((n) => n + 1);
  }, [state.values]);

  return (
    <form action={act} key={mount}>
      <input type="hidden" name="lead_id" value={leadId} />
      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Customer name</span>
          <input className={f.input} name="customer_name" required defaultValue={v.customer_name} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} name="customer_phone" defaultValue={v.customer_phone} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Email</span>
          <input className={f.input} name="customer_email" type="email" defaultValue={v.customer_email} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Postcode</span>
          <input className={f.input} name="postcode" defaultValue={v.postcode} />
          <span className={f.hint}>
            Contractors see the district only. Clear it if the job is somewhere
            other than this address — they will see the county alone.
          </span>
        </label>
        <label className={f.field}>
          <span className={f.label}>County</span>
          <select className={f.input} name="county_id" required defaultValue={String(v.county_id ?? '')}>
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
        <select className={f.input} name="service_id" required defaultValue={String(v.service_id ?? '')}>
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
        <textarea className={f.textarea} name="details" required rows={4} defaultValue={v.details} />
        <span className={f.hint}>This is what a contractor reads on the quote page.</span>
      </label>

      <div className={a.groupTitle}>Consent (required)</div>
      <label className={f.checkRow}>
        <input type="checkbox" name="consent" defaultChecked={v.consent} />
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
