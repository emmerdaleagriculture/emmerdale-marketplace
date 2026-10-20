'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitDirectoryEnquiryAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { EmailField } from '@/components/forms/EmailField';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';
import s from './directory.module.css';

/**
 * The button on a directory card and the form it opens: name, phone,
 * email, postcode and what needs doing, sent to this one contractor
 * (submitDirectoryEnquiryAction). Closed until pressed, so a page of
 * cards is a page of names, not a page of forms.
 */
export function DirectEnquiryForm({
  contractorId,
  businessName,
  county,
}: {
  contractorId: string;
  businessName: string;
  /** The county page it sits on, if any: the action checks they are listed there. */
  county?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitDirectoryEnquiryAction, emptyFormState);
  const [formTs, setFormTs] = useState('');
  useEffect(() => setFormTs(String(Date.now())), []);

  if (state.ok) return <p className={s.sent}>{state.message}</p>;
  if (!open) {
    return (
      <button type="button" className={s.contact} onClick={() => setOpen(true)}>
        Contact {businessName} direct
      </button>
    );
  }
  return (
    <form action={action} className={s.form}>
      <p className={s.formTitle}>
        This goes to {businessName} alone. They reply to you directly, and you agree the
        work between you.
      </p>
      <input type="hidden" name="contractor_id" value={contractorId} />
      {county && <input type="hidden" name="county" value={county} />}
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
        <EmailField name="email" required hint="They reply to this address." />
        <label className={f.field}>
          <span className={f.label}>Postcode</span>
          <input className={f.input} type="text" name="postcode" required autoComplete="postal-code" />
        </label>
      </div>
      <label className={f.field}>
        <span className={f.label}>What needs doing</span>
        <textarea className={f.textarea} name="details" required maxLength={800} rows={4} placeholder="The job, roughly where, and when you'd like it done." />
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div className={s.formActions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Sending…' : `Send to ${businessName}`}
        </button>
        <button className={f.btnGhost} type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
