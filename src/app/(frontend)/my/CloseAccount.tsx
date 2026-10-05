'use client';

import { useActionState, useState } from 'react';
import { closeAccountAction } from './closeAccount';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

const EMPTY: FormState = {};

/** Closing the account: open jobs withdrawn, details removed, login deleted. */
export function CloseAccount() {
  const [state, action, pending] = useActionState(closeAccountAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <p className={a.sub}>
        <button type="button" className={f.linkButton} onClick={() => setOpen(true)}>
          Close my account
        </button>
      </p>
    );
  }
  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <p className={a.sub}>
        <strong>Close your account?</strong> Any job still out for prices is withdrawn, your name,
        phone number, email and photos are removed from all of them, and your login is deleted.
        A booked job stays with its contractor. This can&rsquo;t be undone.
      </p>
      <label className={f.field}>
        <span className={f.label}>Type &ldquo;close&rdquo; to confirm</span>
        <input className={f.input} type="text" name="confirm" autoComplete="off" autoCapitalize="none" required />
      </label>
      <div className={a.actions}>
        <button className={f.btnDanger} type="submit" disabled={pending}>
          {pending ? 'Closing…' : 'Close my account'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </button>
      </div>
    </form>
  );
}
