'use client';

import { useActionState, useState } from 'react';
import { confirmVisitPriceAction, reviseVisitPriceAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * A job booked subject to a site visit: once they've seen it, the contractor
 * confirms the price or revises it. Silence confirms it on the due date.
 */
export function VisitPanel({
  submissionId,
  priceLabel,
  dueLabel,
}: {
  submissionId: string;
  priceLabel: string;
  dueLabel: string | null;
}) {
  const [confirmed, confirm, confirming] = useActionState(confirmVisitPriceAction, EMPTY);
  const [revised, revise, revising] = useActionState(reviseVisitPriceAction, EMPTY);
  const [showRevise, setShowRevise] = useState(false);
  const done = confirmed.ok ? confirmed : revised.ok ? revised : null;
  if (done) return <p className={f.success}>{done.message}</p>;
  const error = confirmed.error ?? revised.error;

  return (
    <div style={{ marginTop: 14, padding: '14px 16px', border: '1px solid #f0d98a', background: '#fff9e8', borderRadius: 8 }}>
      <p style={{ margin: '0 0 10px', fontSize: 14 }}>
        <strong>Booked subject to your site visit.</strong> Once you&rsquo;ve seen it, confirm your
        price of {priceLabel} or revise it.
        {dueLabel ? ` If we don’t hear from you by ${dueLabel}, the price stands.` : ''}
      </p>
      {error && <p className={f.error}>{error}</p>}
      {!showRevise ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <form action={confirm}>
            <input type="hidden" name="submission_id" value={submissionId} />
            <button className={f.btnPrimary} type="submit" disabled={confirming}>
              {confirming ? 'Confirming…' : 'Confirm the price'}
            </button>
          </form>
          <button className={f.btnGhost} type="button" onClick={() => setShowRevise(true)}>
            Revise the price
          </button>
        </div>
      ) : (
        <form action={revise}>
          <input type="hidden" name="submission_id" value={submissionId} />
          <label className={f.field}>
            <span className={f.label}>Your new price (£, what you&rsquo;ll be paid)</span>
            <input className={f.input} name="price" inputMode="decimal" required placeholder="e.g. 450" />
          </label>
          <label className={f.field}>
            <span className={f.label}>What you found that changes it — the customer sees this</span>
            <textarea className={f.textarea} name="reason" rows={3} maxLength={1000} required />
          </label>
          <p className={f.hint}>
            The customer can accept the new price or decline it. If they decline, the job is
            cancelled and their deposit refunded; the visit isn&rsquo;t charged.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={f.btnPrimary} type="submit" disabled={revising}>
              {revising ? 'Sending…' : 'Send the new price'}
            </button>
            <button className={f.btnGhost} type="button" onClick={() => setShowRevise(false)} disabled={revising}>
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
