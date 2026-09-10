'use client';

import { useActionState } from 'react';
import { payBalanceAction, type AcceptActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: AcceptActionState = {};

/**
 * The balance a job owes after sign-off (terms 7.2), in one of three states.
 *
 *  due    — the worker will charge the saved card; nothing to press. Saying so
 *           is the point: a customer who has just confirmed needs to know what
 *           happens next to their money without being asked to do anything.
 *  failed — the off-session charge gave up (expired card, a bank check that
 *           needs them present). This is the ONLY place the customer can pay
 *           it themselves, so it is a button on the page they already have,
 *           minted on demand — never a link in an email that can lapse.
 *  paid   — handled by the caller; this component isn't rendered.
 */
export function PayBalance({
  token,
  amountLabel,
  dueLabel,
  failed,
}: {
  token: string;
  amountLabel: string;
  dueLabel: string | null;
  failed: boolean;
}) {
  const [state, action, pending] = useActionState(payBalanceAction, EMPTY);

  if (!failed) {
    return (
      <p>
        The balance of <strong>{amountLabel}</strong> is due{dueLabel ? ` by ${dueLabel}` : ''}.
        We&rsquo;ll take it from the card you paid your deposit with — nothing to do.
      </p>
    );
  }

  return (
    <div className={m.payPanel}>
      <p>
        We couldn&rsquo;t take the balance of <strong>{amountLabel}</strong> from the card
        you used for the deposit — usually an expired card, or a check your bank wants
        you to approve. You can settle it here{dueLabel ? `; it's due by ${dueLabel}` : ''}.
      </p>
      {state.error && <p className={f.error}>{state.error}</p>}
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Opening payment…' : `Pay ${amountLabel}`}
        </button>
      </form>
      <p className={f.hint}>
        If something about the job isn&rsquo;t right, don&rsquo;t pay — reply to any email
        from us and we&rsquo;ll sort it out first.
      </p>
    </div>
  );
}
