'use client';

import { useActionState } from 'react';
import { confirmCompletionAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * The contractor says the work is finished; the customer confirms it here.
 * Deliberately not a one-tap "done" with no context — confirming releases
 * money, so the panel says so plainly and offers the way out if it isn't right.
 */
export function ConfirmDone({
  token,
  contractorName,
}: {
  token: string;
  contractorName: string;
}) {
  const [state, action, pending] = useActionState(confirmCompletionAction, EMPTY);

  return (
    <div className={m.awardPanel}>
      <p>
        <strong>{contractorName}</strong> has marked your job as finished.
      </p>
      <p>
        If you&rsquo;re happy with the work, confirm it below — that&rsquo;s what releases
        their payment. If something isn&rsquo;t right, don&rsquo;t confirm: reply to any
        email from us and we&rsquo;ll sort it out.
      </p>
      {state.ok ? (
        <p className={f.success}>{state.message}</p>
      ) : (
        <form action={action}>
          {state.error && <p className={f.error}>{state.error}</p>}
          <input type="hidden" name="token" value={token} />
          <button className={f.btnPrimary} type="submit" disabled={pending}>
            {pending ? 'Confirming…' : 'Yes — the work is done'}
          </button>
        </form>
      )}
    </div>
  );
}
