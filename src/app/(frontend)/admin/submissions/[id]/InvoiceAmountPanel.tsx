'use client';

import { useActionState } from 'react';
import { applyInvoiceAmountAction, declineInvoiceAmountAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * The contractor's invoice came to a different figure from the quote. Their
 * claim, not yet the price: charging it emails the customer for the
 * difference at once, so it is a decision, not a default.
 */
export function InvoiceAmountPanel({
  submissionId,
  chargeLabel,
}: {
  submissionId: string;
  /** "Charge the customer £230 more" — from the same markup as the SQL. */
  chargeLabel: string;
}) {
  const [applied, apply, applying] = useActionState(applyInvoiceAmountAction, EMPTY);
  const [declined, decline, declining] = useActionState(declineInvoiceAmountAction, EMPTY);

  const done = applied.ok ? applied : declined.ok ? declined : null;
  if (done) return <p className={f.success}>{done.message}</p>;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
      <form action={apply}>
        <input type="hidden" name="submission_id" value={submissionId} />
        <button type="submit" className={f.btnPrimary} disabled={applying || declining}>
          {applying ? 'Sending…' : chargeLabel}
        </button>
      </form>
      <form action={decline}>
        <input type="hidden" name="submission_id" value={submissionId} />
        <button type="submit" className={f.btnGhost} disabled={applying || declining}>
          {declining ? 'Saving…' : 'Pay the quoted amount'}
        </button>
      </form>
      {(applied.error || declined.error) && <span className={f.error}>{applied.error ?? declined.error}</span>}
    </div>
  );
}
