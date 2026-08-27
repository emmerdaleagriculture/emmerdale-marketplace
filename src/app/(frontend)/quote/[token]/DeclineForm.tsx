'use client';

import { useActionState, useState } from 'react';
import { declineInvitationAction, type QuoteActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import q from './quote.module.css';

const EMPTY: QuoteActionState = {};

const REASONS = [
  { value: 'too_far', label: 'Too far' },
  { value: 'too_busy', label: 'Too busy right now' },
  { value: 'wrong_service', label: 'Not the kind of work I do' },
  { value: 'not_interested', label: 'Not interested' },
];

/** One-tap decline with a reason (§15) — converts silence into data. */
export function DeclineForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(declineInvitationAction, EMPTY);
  const [reason, setReason] = useState('');

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  return (
    <form action={action} className={q.declineBlock}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="reason" value={reason} />
      <span className={f.hint}>Not one for you? One tap and we&rsquo;ll stop chasing:</span>
      <div className={f.chips}>
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="submit"
            className={f.chip}
            disabled={pending}
            onClick={() => setReason(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </form>
  );
}
