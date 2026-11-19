'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import { connectStripeAction, syncStripeAction } from './actions';

export function ConnectButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState(connectStripeAction, emptyFormState);
  return (
    <form action={action}>
      <button className={f.btnPrimary} type="submit" disabled={pending}>
        {pending ? 'Opening Stripe…' : label}
      </button>
      {state.error && <p className={f.error}>{state.error}</p>}
    </form>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState(syncStripeAction, emptyFormState);
  return (
    <form action={action}>
      <button className={f.btnGhost} type="submit" disabled={pending}>
        {pending ? 'Checking Stripe…' : 'Sync from Stripe now'}
      </button>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && state.message && <p className={f.success}>{state.message}</p>}
    </form>
  );
}
