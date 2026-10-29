'use client';

import { useActionState } from 'react';
import { decideInvoiceAmountAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * The contractor's invoice came to a different figure from the quote. Their
 * claim, not yet the price: applying it emails the customer for the
 * difference at once, so it is a decision, not a default. One form, two
 * buttons, and a note for the log ("Pete confirmed the extra area by phone").
 */
export function InvoiceAmountPanel({
  submissionId,
  applyLabel,
}: {
  submissionId: string;
  /** "Charge the customer £230 more" — from the same markup as the SQL. */
  applyLabel: string;
}) {
  const [state, action, pending] = useActionState(decideInvoiceAmountAction, EMPTY);

  if (state.ok) return <p className={f.success}>{state.message}</p>;

  return (
    <form action={action} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <input
        className={f.input}
        name="note"
        maxLength={1000}
        placeholder="Note for the log (optional)"
        style={{ padding: '4px 8px', fontSize: 12, width: 280 }}
      />
      <button type="submit" name="decision" value="apply" className={f.btnPrimary} disabled={pending}>
        {pending ? 'Working…' : applyLabel}
      </button>
      <button type="submit" name="decision" value="decline" className={f.btnGhost} disabled={pending}>
        Pay the quoted amount and ask the customer for it
      </button>
      {state.error && <span className={f.error}>{state.error}</span>}
    </form>
  );
}
