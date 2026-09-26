'use client';

import { useActionState } from 'react';
import { declineInvitationAction, type QuoteActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import q from './quote.module.css';

const EMPTY: QuoteActionState = {};

/** The vocabulary decline_invitation accepts, in the order the chips show. */
export const DECLINE_REASONS = [
  { value: 'too_far', label: 'Too far' },
  { value: 'too_busy', label: 'Too busy right now' },
  { value: 'wrong_service', label: 'Not the kind of work I do' },
  { value: 'not_interested', label: 'Not interested' },
] as const;

/**
 * The reason chips. Each is a submit button carrying its own value, so the
 * form needs no state and works before hydration.
 */
export function ReasonChips({ disabled }: { disabled?: boolean }) {
  return (
    <div className={f.chips}>
      {DECLINE_REASONS.map((r) => (
        <button key={r.value} type="submit" name="reason" value={r.value} className={f.chip} disabled={disabled}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** One-tap decline with a reason (§15) — converts silence into data. */
export function DeclineForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(declineInvitationAction, EMPTY);

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  return (
    <form action={action} className={q.declineBlock}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <span className={f.hint}>Not one for you? One tap and we&rsquo;ll stop chasing:</span>
      <ReasonChips disabled={pending} />
    </form>
  );
}
