'use client';

import { useActionState, useState } from 'react';
import { closeCustomerAction } from './close-customer-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../../admin.module.css';

const EMPTY: FormState = {};

/** "Close my account and take my jobs off": every job under this email. */
export function CloseCustomerButton({ submissionId, customer }: { submissionId: string; customer: string | null }) {
  const [state, action, pending] = useActionState(closeCustomerAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (state.ok) return <p className={f.success}>{state.message}</p>;
  if (!open) {
    return (
      <button type="button" className={s.btnSuspend} onClick={() => setOpen(true)}>
        Close this customer&rsquo;s account
      </button>
    );
  }
  return (
    <form action={action} style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      {state.error && <p className={f.error}>{state.error}</p>}
      <p className={s.sub}>
        Every job under {customer ? `${customer}’s` : 'this'} email: open ones withdrawn (contractors with a price
        are told), name, phone, email, access notes, photos and their messages removed, link revoked, login deleted.
        Prices, events and the split-test arm stay for the numbers. Can&rsquo;t be undone.
      </p>
      <label className={f.field}>
        <span className={f.label}>Type &ldquo;close&rdquo; to confirm</span>
        <input className={f.input} type="text" name="confirm" autoComplete="off" autoCapitalize="none" required />
      </label>
      <div className={s.actions}>
        <button className={s.btnSuspend} type="submit" disabled={pending}>
          {pending ? 'Closing…' : 'Close the account'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
