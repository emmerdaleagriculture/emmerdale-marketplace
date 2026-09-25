'use client';

import { useActionState, useState } from 'react';
import { proposeExtraWorkAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { computeClientPricePence, formatGBP, poundsInputToPence } from '@/lib/sealedQuotes/money';
import f from '@/components/forms/forms.module.css';

/**
 * Extra work the contractor spotted on site, priced to us (contractor terms
 * clause 5). Behind a button because sending it emails the customer a price
 * the moment it goes. Mirrors the admin's ExtraWorkForm, minus the "where
 * the price came from" box — here the price comes from the person typing.
 */
export function ProposeWorkForm({
  submissionId,
  customerName,
  markupRate,
}: {
  submissionId: string;
  customerName: string;
  markupRate: number;
}) {
  const [state, act, pending] = useActionState(proposeExtraWorkAction, emptyFormState);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');

  if (state.ok) return <p className={f.success}>{state.message}</p>;
  if (!open) {
    return (
      <p style={{ marginTop: 12 }}>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(true)}>
          Propose extra work
        </button>
        <span className={f.hint} style={{ marginLeft: 10 }}>
          Spotted something else worth doing? Price it here and {customerName} can accept
          it on their job page.
        </span>
      </p>
    );
  }

  // The same arithmetic as client_price_pence(), in integer pence — float
  // maths here said £445 for £400 at 10%.
  const pence = poundsInputToPence(price);
  const customer = pence !== null ? computeClientPricePence(pence, markupRate) : null;

  return (
    <form action={act} style={{ maxWidth: 520, marginTop: 12 }}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />
      <label className={f.field}>
        <span className={f.label}>What the extra work is ({customerName} sees this)</span>
        <input
          className={f.input}
          name="description"
          required
          maxLength={200}
          placeholder="Roll and reseed the bare patch by the gate"
        />
      </label>
      <label className={f.field}>
        <span className={f.label}>Your price, £</span>
        <input
          className={f.input}
          name="price"
          inputMode="decimal"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="250"
        />
        <span className={f.hint}>
          {customer !== null && pence !== null
            ? `You keep ${formatGBP(pence)}. The customer sees ${formatGBP(customer)} and pays a deposit on that to book it.`
            : 'You keep this in full — our margin goes on top for the customer.'}
        </span>
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
        <span className={f.label}>A note for {customerName} (optional)</span>
        <textarea
          className={f.textarea}
          name="note_to_client"
          rows={2}
          maxLength={200}
          placeholder="Could do this the same day while the kit's on site."
        />
        <span className={f.hint}>No prices or charges in here — the figure above is the price.</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className={f.btnPrimary} disabled={pending}>
          {pending ? 'Sending…' : 'Send it to the customer'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
