'use client';

import { useActionState, useState } from 'react';
import { requestBalanceAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * Ask the customer for the balance without waiting for the invoice. The
 * normal path opens it when the contractor confirms their total on upload;
 * this is for the one who never uploads. Two taps, because it emails the
 * customer for money the moment it runs.
 */
export function RequestBalanceButton({ submissionId, invoiceIn }: { submissionId: string; invoiceIn: boolean }) {
  const [state, action, pending] = useActionState(requestBalanceAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  if (state.ok) return <p className={f.success}>{state.message}</p>;
  if (!confirming) {
    return (
      <p>
        {invoiceIn ? 'The invoice is in but no balance has been requested.' : 'The customer hasn’t been asked for the balance yet: that happens when the invoice is in.'}{' '}
        <button type="button" className={f.btnGhost} onClick={() => setConfirming(true)} style={{ padding: '2px 8px', fontSize: 12 }}>
          Request the balance now
        </button>
      </p>
    );
  }
  return (
    <form action={action} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <button type="submit" className={f.btnPrimary} disabled={pending} style={{ padding: '2px 8px', fontSize: 12 }}>
        {pending ? 'Sending…' : 'Yes, email the customer for the quoted balance'}
      </button>
      <button type="button" className={f.btnGhost} onClick={() => setConfirming(false)} style={{ padding: '2px 8px', fontSize: 12 }}>
        Not yet
      </button>
      {state.error && <span className={f.error}>{state.error}</span>}
    </form>
  );
}
