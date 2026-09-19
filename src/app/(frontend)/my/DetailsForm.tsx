'use client';

import { useActionState, useState } from 'react';
import { updateDetailsAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

/**
 * Name and phone, for an account that previously had no way to change either.
 *
 * Folded away behind a line rather than shown open: this page is called "Your
 * jobs" and that is what someone came for. A details panel sitting above the
 * list would push the jobs down the page for the sake of two fields almost
 * nobody edits.
 */
export function DetailsForm({
  email,
  initial,
}: {
  email: string;
  initial: { contactName: string | null; phone: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateDetailsAction, emptyFormState);

  if (!open) {
    return (
      <p className={f.hint}>
        {initial.contactName ? `Your jobs go out as ${initial.contactName}.` : 'We have no name for you yet.'}{' '}
        <button type="button" className={f.linkButton} onClick={() => setOpen(true)}>
          Change your details
        </button>
        {state.ok && state.message ? ` ${state.message}` : ''}
      </p>
    );
  }

  return (
    <form action={action}>
      <label className={f.field}>
        <span className={f.label}>Your name</span>
        <input
          className={f.input}
          type="text"
          name="contact_name"
          required
          autoComplete="name"
          defaultValue={initial.contactName ?? ''}
        />
      </label>

      <label className={f.field}>
        <span className={f.label}>Phone (optional)</span>
        <input
          className={f.input}
          type="tel"
          name="phone"
          autoComplete="tel"
          defaultValue={initial.phone ?? ''}
        />
        <span className={f.hint}>
          Only ever given to the contractor you accept a price from.
        </span>
      </label>

      {/* Shown, not editable, and deliberately unnamed so it is never posted:
          this is the address the account signs in with, and changing it is an
          auth change rather than a detail change. */}
      <label className={f.field}>
        <span className={f.label}>Email</span>
        <input className={f.input} type="email" value={email} readOnly disabled />
        <span className={f.hint}>You sign in with this. Email us if it needs changing.</span>
      </label>

      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save details'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
