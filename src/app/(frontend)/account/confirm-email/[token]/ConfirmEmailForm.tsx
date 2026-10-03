'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { confirmEmailAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '../../../auth.module.css';

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmEmailAction, emptyFormState);

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success}>{state.message}</p>
        <p>
          <Link href="/account">Go to your dashboard →</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={a.card}>
      <input type="hidden" name="token" value={token} />
      {state.error && <p className={f.error}>{state.error}</p>}
      <button className={f.btnPrimary} type="submit" disabled={pending}>
        {pending ? 'Confirming…' : 'Confirm'}
      </button>
    </form>
  );
}
