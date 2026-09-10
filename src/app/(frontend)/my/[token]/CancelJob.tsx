'use client';

import { useActionState, useState } from 'react';
import { cancelJobAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * Cancelling before work starts (terms 9.1).
 *
 * Two steps on purpose. It stands a contractor down and forfeits the deposit,
 * so what it costs is stated in the confirmation rather than discovered
 * afterwards — including the normal case, where the deposit is the whole of
 * what has been paid and nothing comes back.
 */
export function CancelJob({ token, refundLabel, feeLabel, refundPence }: {
  token: string;
  refundLabel: string;
  feeLabel: string;
  refundPence: number;
}) {
  const [state, action, pending] = useActionState(cancelJobAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  if (state.ok) return <p className={f.success}>{state.message}</p>;

  return (
    <div className={m.awardPanel}>
      {state.error && <p className={f.error}>{state.error}</p>}
      {!confirming ? (
        <>
          <p>
            Need to cancel? You can, any time before the work starts.
          </p>
          <button className={f.btnGhost} type="button" onClick={() => setConfirming(true)}>
            Cancel this job
          </button>
        </>
      ) : (
        <>
          <p>
            <strong>Cancel this job?</strong> The {feeLabel} deposit isn&rsquo;t
            refundable — it covers the matching and scheduling already done, and it is
            the cancellation fee in our terms.
            {refundPence > 0 && (
              <>
                {' '}
                Anything you&rsquo;ve paid above it — <strong>{refundLabel}</strong> —
                goes back to your card, usually within 5 working days.
              </>
            )}{' '}
            Nothing further will be taken.
          </p>
          <p>Your contractor will be told straight away. This can&rsquo;t be undone.</p>
          <form action={action} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="hidden" name="token" value={token} />
            <button className={f.btnPrimary} type="submit" disabled={pending}>
              {pending ? 'Cancelling…' : refundPence > 0 ? `Yes, cancel and refund ${refundLabel}` : 'Yes, cancel this job'}
            </button>
            <button
              className={f.btnGhost}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep the job
            </button>
          </form>
        </>
      )}
    </div>
  );
}
