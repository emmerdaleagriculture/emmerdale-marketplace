'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadInvoiceAction } from './actions';
import type { FormState } from '@/lib/form';
import { formatGBP, poundsInputToPence } from '@/lib/sealedQuotes/money';
import f from '@/components/forms/forms.module.css';
import s from './won.module.css';

const EMPTY: FormState = {};

/**
 * Send us the invoice for a finished job.
 *
 * By this point the customer has confirmed, the money is held and the payout
 * is owed — the invoice is the last piece of paper in the way, and it used to
 * travel by email, or not travel at all, with nothing on the job saying which.
 *
 * A photo counts. Most of this network reads their jobs standing in a yard,
 * and telling someone to go and make a PDF is telling them to do it later.
 *
 * The total is asked for alongside it: a box to say the invoice matches the
 * quote, or the figure it does come to and why. Until 29 Oct 2026 the only
 * record of an invoice for more than the quote was the photo itself.
 */
export function InvoiceUpload({
  submissionId,
  sentName,
  sentAt,
  quotedPence,
}: {
  submissionId: string;
  sentName: string | null;
  sentAt: string | null;
  /** Their price on the accepted quote; null if it can't be read. */
  quotedPence: number | null;
}) {
  const [state, action, pending] = useActionState(uploadInvoiceAction, EMPTY);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [matches, setMatches] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const alreadySent = Boolean(sentAt) && !state.ok;

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  if (alreadySent && !replacing) {
    return (
      <div className={s.invoiceDone}>
        <p>
          <strong>Invoice received.</strong>{' '}
          {sentName ? `${sentName}, ` : ''}
          {sentAt ? new Date(sentAt).toLocaleDateString('en-GB') : ''}. It&rsquo;s paid
          once the customer&rsquo;s balance has cleared.
        </p>
        <button type="button" className={s.linkish} onClick={() => setReplacing(true)}>
          Send a different one
        </button>
      </div>
    );
  }

  const amountPence = poundsInputToPence(amount);
  const amountReady = matches || (amountPence !== null && amountPence > 0 && reason.trim().length >= 3);

  return (
    <form action={action} className={s.invoiceForm}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />

      <p className={s.invoicePrompt}>
        {replacing ? 'Replace your invoice' : 'Send us your invoice. It’s paid once the customer’s balance has cleared.'}
      </p>

      <input
        ref={inputRef}
        type="file"
        name="invoice"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className={s.fileInput}
        onChange={(e) => setFilename(e.target.files?.[0]?.name ?? null)}
      />
      <button
        type="button"
        className={f.btnGhost}
        onClick={() => inputRef.current?.click()}
      >
        {filename ?? 'Choose a file or take a photo'}
      </button>

      <label className={f.checkRow}>
        <input
          type="checkbox"
          name="matches_quote"
          checked={matches}
          onChange={(e) => setMatches(e.target.checked)}
        />
        <span>
          My invoice total is{' '}
          {quotedPence != null ? <strong>{formatGBP(quotedPence)}</strong> : 'the price'} I quoted
        </span>
      </label>

      {!matches && (
        <>
          <label className={f.field}>
            <span className={f.label}>If not, what does your invoice come to? (£)</span>
            <input
              className={f.input}
              name="invoiced"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="550"
            />
          </label>
          <label className={f.field}>
            <span className={f.label}>What&rsquo;s different from the quote?</span>
            <textarea
              className={f.textarea}
              name="invoice_note"
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Extra 4 acres cut at the customer's request"
            />
            <span className={f.hint}>
              We check it with you before anything changes, and the customer sees this reason if
              we ask them for the difference.
            </span>
          </label>
        </>
      )}

      <button className={f.btnPrimary} type="submit" disabled={pending || !filename || !amountReady}>
        {pending ? 'Sending…' : 'Send invoice'}
      </button>
      <p className={s.invoiceHint}>PDF or a photo, up to 10MB.</p>
    </form>
  );
}
