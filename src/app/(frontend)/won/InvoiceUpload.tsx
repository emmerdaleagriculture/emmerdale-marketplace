'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadInvoiceAction } from './actions';
import type { FormState } from '@/lib/form';
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
 */
export function InvoiceUpload({
  submissionId,
  sentName,
  sentAt,
}: {
  submissionId: string;
  sentName: string | null;
  sentAt: string | null;
}) {
  const [state, action, pending] = useActionState(uploadInvoiceAction, EMPTY);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);

  const alreadySent = Boolean(sentAt) && !state.ok;

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  if (alreadySent && !replacing) {
    return (
      <div className={s.invoiceDone}>
        <p>
          <strong>Invoice received.</strong>{' '}
          {sentName ? `${sentName} — ` : ''}
          {sentAt ? new Date(sentAt).toLocaleDateString('en-GB') : ''}. We&rsquo;ll get it
          paid.
        </p>
        <button type="button" className={s.linkish} onClick={() => setReplacing(true)}>
          Send a different one
        </button>
      </div>
    );
  }

  return (
    <form action={action} className={s.invoiceForm}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />

      <p className={s.invoicePrompt}>
        {replacing ? 'Replace your invoice' : 'Send us your invoice and we’ll pay it.'}
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

      <button className={f.btnPrimary} type="submit" disabled={pending || !filename}>
        {pending ? 'Sending…' : 'Send invoice'}
      </button>
      <p className={s.invoiceHint}>PDF or a photo, up to 10MB.</p>
    </form>
  );
}
