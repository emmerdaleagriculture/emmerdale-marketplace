'use client';

import { useActionState } from 'react';
import { openToMarketAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * A repeat offered to the customer's previous contractor first: send it to
 * everyone else now instead of waiting out the 48 hours.
 */
export function OpenToMarket({ token, label }: { token: string; label: string }) {
  const [state, action, pending] = useActionState(openToMarketAction, EMPTY);

  if (state.ok) return <p className={f.success}>{state.message}</p>;

  return (
    <form action={action} style={{ marginBottom: 20 }}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <button className={f.btnGhost} type="submit" disabled={pending}>
        {pending ? 'Sending…' : label}
      </button>
    </form>
  );
}
