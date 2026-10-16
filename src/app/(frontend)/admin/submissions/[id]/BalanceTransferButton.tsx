'use client';

import { useActionState, useState } from 'react';
import { markBalanceTransferredAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * "Received by bank transfer" on a balance row. Two taps: the second asks for
 * the day's confirmation and takes an optional note (the statement line, say),
 * because this settles the job for good — the customer is emailed, the
 * contractor is asked for an invoice, and the payout falls due.
 */
export function BalanceTransferButton({
  submissionId,
  paymentId,
  amountLabel,
  reference,
}: {
  submissionId: string;
  paymentId: string;
  amountLabel: string;
  reference: string;
}) {
  const [state, action, pending] = useActionState(markBalanceTransferredAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className={f.btnGhost}
        onClick={() => setConfirming(true)}
        style={{ padding: '2px 8px', fontSize: 11, marginLeft: 8 }}
      >
        Received by bank transfer
      </button>
    );
  }

  return (
    <form action={action} style={{ display: 'inline-flex', gap: 6, marginLeft: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="payment_id" value={paymentId} />
      <input
        className={f.input}
        name="note"
        placeholder={`e.g. ${reference} on the statement`}
        style={{ padding: '2px 8px', fontSize: 11, width: 220 }}
      />
      <button type="submit" className={f.btnGhost} disabled={pending} style={{ padding: '2px 8px', fontSize: 11 }}>
        {pending ? 'Marking…' : `Yes, ${amountLabel} has arrived`}
      </button>
      <button
        type="button"
        className={f.btnGhost}
        onClick={() => setConfirming(false)}
        style={{ padding: '2px 8px', fontSize: 11 }}
      >
        Not yet
      </button>
      {state.error && <span className={f.error}>{state.error}</span>}
    </form>
  );
}
