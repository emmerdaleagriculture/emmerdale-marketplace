'use client';

import { useActionState } from 'react';
import { acceptQuoteAction, type AcceptActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: AcceptActionState = {};

/**
 * The awaiting-payment state (§27): one tap re-fetches the live payment link
 * (or mints a fresh one if the old link lapsed) — retry is never a fresh
 * decision.
 */
export function PayNow({
  token,
  quoteId,
  label,
  amountLabel,
}: {
  token: string;
  quoteId: string;
  label: string;
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState(acceptQuoteAction, EMPTY);

  return (
    <div className={m.payPanel}>
      <p>
        You&rsquo;ve accepted <strong>{label}</strong> at <strong>{amountLabel}</strong>.
        Complete payment to confirm the booking — the payment link is valid for 24
        hours, and your money is only released to the contractor when the
        work&rsquo;s done.
      </p>
      {state.error && <p className={f.error}>{state.error}</p>}
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="client_quote_id" value={quoteId} />
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Opening payment…' : 'Pay now'}
        </button>
      </form>
      <p className={f.hint}>
        If the link runs out, nothing is booked and no money is taken — your prices
        stay here to accept again.
      </p>
    </div>
  );
}
