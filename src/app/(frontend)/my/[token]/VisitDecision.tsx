'use client';

import { useActionState, useState } from 'react';
import { acceptRevisedPriceAction, declineRevisedPriceAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * A price revised after the site visit: accept it, or decline it and have the
 * whole deposit back. Declining asks once more, because it cancels the job.
 */
export function VisitDecision({
  token,
  contractorName,
  oldLabel,
  newLabel,
  reason,
  depositLabel,
}: {
  token: string;
  contractorName: string;
  oldLabel: string;
  newLabel: string;
  reason: string;
  depositLabel: string;
}) {
  const [accepted, accept, accepting] = useActionState(acceptRevisedPriceAction, EMPTY);
  const [declined, decline, declining] = useActionState(declineRevisedPriceAction, EMPTY);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const done = accepted.ok ? accepted : declined.ok ? declined : null;
  if (done) return <p className={f.success}>{done.message}</p>;
  const error = accepted.error ?? declined.error;
  const pending = accepting || declining;

  return (
    <div className={m.awardPanel}>
      {error && <p className={f.error}>{error}</p>}
      <p>
        <strong>{contractorName}</strong> has been to see the job and revised the price from{' '}
        {oldLabel} to <strong>{newLabel}</strong>.
      </p>
      <p>Their reason: &ldquo;{reason}&rdquo;</p>
      {!confirmingDecline ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <form action={accept}>
            <input type="hidden" name="token" value={token} />
            <button className={f.btnYellow} type="submit" disabled={pending}>
              {accepting ? 'Accepting…' : `Accept ${newLabel}`}
            </button>
          </form>
          <button className={f.btnGhost} type="button" onClick={() => setConfirmingDecline(true)} disabled={pending}>
            Decline and get my deposit back
          </button>
        </div>
      ) : (
        <>
          <p>
            <strong>Decline the new price?</strong> The job is cancelled and your {depositLabel} deposit
            goes back to your card in full, usually within 5 working days. This can&rsquo;t be undone.
          </p>
          <form action={decline} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="hidden" name="token" value={token} />
            <button className={f.btnPrimary} type="submit" disabled={pending}>
              {declining ? 'Refunding…' : 'Yes, decline and refund'}
            </button>
            <button className={f.btnGhost} type="button" onClick={() => setConfirmingDecline(false)} disabled={pending}>
              Back
            </button>
          </form>
        </>
      )}
    </div>
  );
}
