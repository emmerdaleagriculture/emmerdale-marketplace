'use client';

import { useActionState, useState } from 'react';
import { addExtraWorkAction } from './distribution-actions';
import { emptyFormState } from '@/lib/form';
import { computeClientPricePence, formatGBP, poundsInputToPence } from '@/lib/sealedQuotes/money';
import f from '@/components/forms/forms.module.css';

/**
 * Extra work the customer asked their contractor for, priced to us. Behind a
 * button because it emails the customer a price the moment it is sent.
 */
export function ExtraWorkForm({
  submissionId,
  contractorName,
  markupRate,
}: {
  submissionId: string;
  contractorName: string;
  markupRate: number;
}) {
  const [state, act, pending] = useActionState(addExtraWorkAction, emptyFormState);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');

  if (state.ok) return <p className={f.success}>{state.message}</p>;
  if (!open) {
    return (
      <button type="button" className={f.btnGhost} onClick={() => setOpen(true)}>
        Add extra work priced by {contractorName}
      </button>
    );
  }

  // The same arithmetic as client_price_pence(), in integer pence — float
  // maths here said £445 for £400 at 10%.
  const pence = poundsInputToPence(price);
  const customer = pence !== null ? computeClientPricePence(pence, markupRate) : null;

  return (
    <form action={act} style={{ maxWidth: 520 }}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />
      <label className={f.field}>
        <span className={f.label}>What the extra work is (the customer sees this)</span>
        <input className={f.input} name="description" required maxLength={200} placeholder="Supply and spread fertiliser and lime" />
      </label>
      <label className={f.field}>
        <span className={f.label}>{contractorName}&rsquo;s price, £</span>
        <input
          className={f.input}
          name="price"
          inputMode="decimal"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="1760"
        />
        {customer !== null && (
          <span className={f.hint}>
            The customer sees {formatGBP(customer)}, and pays a deposit on that to book.
          </span>
        )}
      </label>
      <label className={f.field}>
        <span className={f.label}>VAT</span>
        <select className={f.input} name="price_basis" defaultValue="unspecified">
          <option value="unspecified">Not stated</option>
          <option value="inc_vat">Includes VAT</option>
          <option value="no_vat">No VAT</option>
        </select>
      </label>
      <label className={f.field}>
        <span className={f.label}>Where the price came from (for the log)</span>
        <input className={f.input} name="reason" required maxLength={200} placeholder="Nick's email to Tom, 25 Sept" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className={f.btnPrimary} disabled={pending}>
          {pending ? 'Sending…' : 'Send the price to the customer'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
