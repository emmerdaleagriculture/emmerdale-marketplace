'use client';

import { useActionState } from 'react';
import { markDoneAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/** One tap (§25): "the work's finished." The customer confirms after this. */
export function MarkDoneButton({ submissionId }: { submissionId: string }) {
  const [state, action, pending] = useActionState(markDoneAction, EMPTY);

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  return (
    <form action={action} style={{ marginTop: 12 }}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />
      <button className={f.btnPrimary} type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Mark the work as done'}
      </button>
      <span className={f.hint} style={{ marginLeft: 10 }}>
        We&rsquo;ll ask the customer to confirm — that releases your payment.
      </span>
    </form>
  );
}
