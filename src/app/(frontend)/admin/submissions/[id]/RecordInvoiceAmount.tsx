'use client';

import { useActionState, useState } from 'react';
import { recordInvoiceAmountAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * The contractor's invoice figure, keyed in by an operator. The contractor
 * records it themselves on upload; this is for the invoice that came in
 * before that existed, or the figure that arrived by email or phone. Same
 * function as theirs, with the operator named: a different figure lands as a
 * decision to apply or decline, a matching one asks the customer for the
 * quoted balance at once. Shown only while nothing is recorded, and the page
 * re-renders past it on success, so the success line is rarely seen.
 */
export function RecordInvoiceAmount({ submissionId, quotedLabel }: { submissionId: string; quotedLabel: string }) {
  const [state, action, pending] = useActionState(recordInvoiceAmountAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (state.ok) return <p className={f.success}>{state.message}</p>;
  if (!open) {
    return (
      <p>
        No invoice figure recorded against the {quotedLabel} quote.{' '}
        <button type="button" className={f.btnGhost} onClick={() => setOpen(true)} style={{ padding: '2px 8px', fontSize: 12 }}>
          Record the invoice figure
        </button>
      </p>
    );
  }
  return (
    <form action={action} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        Invoice total £
        <input
          className={f.input}
          name="invoiced"
          inputMode="decimal"
          required
          placeholder="550"
          style={{ padding: '4px 8px', fontSize: 12, width: 90 }}
        />
      </label>
      <input
        className={f.input}
        name="note"
        maxLength={1000}
        placeholder="Their reason, in their words (needed if it differs)"
        style={{ padding: '4px 8px', fontSize: 12, width: 320 }}
      />
      <button type="submit" className={f.btnPrimary} disabled={pending}>
        {pending ? 'Working…' : 'Record'}
      </button>
      <button type="button" className={f.btnGhost} onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </button>
      {state.error && <span className={f.error}>{state.error}</span>}
    </form>
  );
}
