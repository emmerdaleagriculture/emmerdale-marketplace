'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitEnquiryAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { EmailField } from '@/components/forms/EmailField';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

/**
 * Reusable customer-enquiry form for new marketplace verticals (hay, tractor
 * hire). Posts to submitEnquiryAction, which files a lead + emails admins.
 */
export function EnquiryForm({
  category,
  detailsLabel,
  detailsPlaceholder,
  submitLabel,
}: {
  category: 'hay' | 'tractor-hire';
  detailsLabel: string;
  detailsPlaceholder: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(submitEnquiryAction, emptyFormState);
  const [formTs, setFormTs] = useState('');
  useEffect(() => setFormTs(String(Date.now())), []);

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={a.card}>
      {state.error && <p className={f.error}>{state.error}</p>}

      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="form_ts" value={formTs} />
      {/* Honeypot — real users never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Your name</span>
          <input className={f.input} type="text" name="name" required autoComplete="name" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} type="tel" name="phone" required autoComplete="tel" />
        </label>
        <EmailField name="email" required hint="We reply to this address." />
        <label className={f.field}>
          <span className={f.label}>Postcode</span>
          <input className={f.input} type="text" name="postcode" required autoComplete="postal-code" />
          <span className={f.hint}>So we can match you with someone nearby.</span>
        </label>
      </div>

      <label className={f.field}>
        <span className={f.label}>{detailsLabel}</span>
        <textarea className={f.textarea} name="details" required maxLength={800} placeholder={detailsPlaceholder} />
      </label>

      {/* The enquiry now goes straight to contractors, so the customer has to
          be told that before they send it — not afterwards. This is the same
          substance as the consent an operator used to tick on their behalf in
          NewJobForm, shown to the person it actually concerns. Sending is the
          agreement, so there is no box to tick: an unticked box on the last
          field of a form is a conversion tax, and a required one is consent
          in name only. Wording version v3-portal in the stored record. */}
      <p className={f.hint} style={{ marginTop: 4 }}>
        Sending this passes your name and number to vetted contractors covering
        your county, so they can contact you directly about it. We don&rsquo;t
        publish your postcode — only the county.
      </p>

      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Sending…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
