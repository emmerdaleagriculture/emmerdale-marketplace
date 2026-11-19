'use client';

import { useActionState } from 'react';
import { emptyFormState, type FormState } from '@/lib/form';
import { penceToDecimal } from '@/lib/books/money';
import { PAYMENT_METHODS } from '@/lib/books/invoice';
import f from '@/components/forms/forms.module.css';
import s from '../../books.module.css';
import { issueInvoiceAction, recordPaymentAction, sendInvoiceAction, voidInvoiceAction } from '../actions';

function ActionButton({
  action,
  invoiceId,
  label,
  busy,
  ghost,
  confirm,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  invoiceId: number;
  label: string;
  busy: string;
  ghost?: boolean;
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, emptyFormState);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <button className={ghost ? f.btnGhost : f.btnPrimary} type="submit" disabled={pending} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'left' }}>
        {pending ? busy : label}
      </button>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && state.message && <p className={f.success}>{state.message}</p>}
    </form>
  );
}

export function InvoiceActions({
  invoiceId,
  status,
  customerEmail,
  due,
  sentBefore,
  today,
}: {
  invoiceId: number;
  status: string;
  customerEmail: string | null;
  due: number;
  sentBefore: boolean;
  today: string;
}) {
  const [payState, pay, paying] = useActionState(recordPaymentAction, emptyFormState);
  return (
    <>
      <div className={s.actions}>
        {status !== 'void' && (
          <ActionButton
            action={sendInvoiceAction}
            invoiceId={invoiceId}
            label={customerEmail ? `${sentBefore ? 'Send again' : status === 'draft' ? 'Issue and send' : 'Send'} to ${customerEmail}` : 'Send by email'}
            busy="Sending…"
            confirm={status === 'draft' ? 'Issue this invoice and email it? Once issued it can’t be edited.' : undefined}
          />
        )}
        {status === 'draft' && (
          <ActionButton action={issueInvoiceAction} invoiceId={invoiceId} label="Issue without sending" busy="Issuing…" ghost confirm="Issue this invoice? Once issued it can’t be edited." />
        )}
        {(status === 'draft' || (status === 'issued' && due > 0)) && (
          <ActionButton
            action={voidInvoiceAction}
            invoiceId={invoiceId}
            label={status === 'draft' ? 'Delete draft' : 'Void'}
            busy="…"
            ghost
            confirm={status === 'draft' ? 'Delete this draft?' : 'Void this invoice? Its sale is reversed in your books.'}
          />
        )}
      </div>

      {status === 'issued' && due > 0 && (
        <form action={pay} className={s.fieldset} style={{ maxWidth: 640, marginBottom: 24 }}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <strong>Record a payment</strong>
          <div className={s.row3}>
            <label className={f.field}>
              <span className={f.label}>Amount (£)</span>
              <input className={f.input} name="amount" inputMode="decimal" defaultValue={penceToDecimal(due)} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Date</span>
              <input className={f.input} type="date" name="paid_on" defaultValue={today} max={today} />
            </label>
            <label className={f.field}>
              <span className={f.label}>How</span>
              <select className={f.input} name="method" defaultValue="bank">
                {Object.entries(PAYMENT_METHODS)
                  .filter(([k]) => k !== 'stripe')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Reference (optional)</span>
            <input className={f.input} name="reference" maxLength={100} />
          </label>
          {payState.error && <p className={f.error}>{payState.error}</p>}
          {payState.ok && payState.message && <p className={f.success}>{payState.message}</p>}
          <div>
            <button className={f.btnGhost} type="submit" disabled={paying}>
              {paying ? 'Recording…' : 'Record payment'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
