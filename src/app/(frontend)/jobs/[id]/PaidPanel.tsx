'use client';

import { useActionState } from 'react';
import { markBookedAction } from './paid-actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import j from '../jobs.module.css';

type Contact = { customer_name: string; customer_phone: string; customer_email: string | null };

/**
 * Paid-member panel: customer contact (already revealed server-side) plus the
 * "I've booked this" flag. Shown instead of the bid panel for active subscribers.
 */
export function PaidPanel({
  jobId,
  contact,
  isExclusive,
}: {
  jobId: string;
  contact: Contact | null;
  isExclusive: boolean;
}) {
  const [state, action, pending] = useActionState(markBookedAction, emptyFormState);

  return (
    <div className={`${j.panel} ${j.contact}`}>
      <div className={j.panelTitle}>
        {isExclusive ? 'Paid early access — customer contact' : 'Customer contact'}
      </div>
      {isExclusive && (
        <p className={f.hint} style={{ marginBottom: 12 }}>
          You’re seeing this {isExclusive ? '12 hours before' : 'ahead of'} the free
          tier. Contact the customer directly — no bidding needed.
        </p>
      )}

      {contact ? (
        <>
          <div className={j.contactRow}>
            <strong>Name</strong> {contact.customer_name}
          </div>
          <div className={j.contactRow}>
            <strong>Phone</strong> {contact.customer_phone}
          </div>
          {contact.customer_email && (
            <div className={j.contactRow}>
              <strong>Email</strong> {contact.customer_email}
            </div>
          )}
          <p className={f.hint} style={{ margin: '12px 0 16px' }}>
            These details are for this enquiry only.
          </p>

          {state.ok ? (
            <p className={f.success}>{state.message}</p>
          ) : (
            <form action={action}>
              {state.error && <p className={f.error}>{state.error}</p>}
              <input type="hidden" name="job_id" value={jobId} />
              <button type="submit" className={f.btnPrimary} disabled={pending}>
                {pending ? 'Sending…' : 'I’ve booked this'}
              </button>
            </form>
          )}
        </>
      ) : (
        <p className={f.hint}>Contact details are unavailable for this job.</p>
      )}
    </div>
  );
}
