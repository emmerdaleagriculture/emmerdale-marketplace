'use client';

import { useActionState } from 'react';
import { logFirstContactAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/** One tap, timestamped (§25): "I've contacted the customer." */
export function FirstContactButton({ submissionId }: { submissionId: string }) {
  const [state, action, pending] = useActionState(logFirstContactAction, EMPTY);

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  return (
    <form action={action} style={{ marginTop: 12 }}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />
      <button className={f.btnPrimary} type="submit" disabled={pending}>
        {pending ? 'Logging…' : 'I’ve contacted the customer'}
      </button>
      <span className={f.hint} style={{ marginLeft: 10 }}>
        One tap — it tells us the job&rsquo;s moving.
      </span>
    </form>
  );
}
