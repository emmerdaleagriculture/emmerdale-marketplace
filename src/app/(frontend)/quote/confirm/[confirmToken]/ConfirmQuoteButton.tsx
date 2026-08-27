'use client';

import { useActionState } from 'react';
import { confirmEmailQuoteAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

const EMPTY: FormState = {};

export function ConfirmQuoteButton({
  confirmToken,
  amountLabel,
}: {
  confirmToken: string;
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState(confirmEmailQuoteAction, EMPTY);

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="confirm_token" value={confirmToken} />
      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Confirming…' : `Yes — ${amountLabel} is my price`}
        </button>
      </div>
      <p className={f.hint}>
        Wrong figure? Use the pricing link from your invitation email instead — a
        new price there replaces this one.
      </p>
    </form>
  );
}
