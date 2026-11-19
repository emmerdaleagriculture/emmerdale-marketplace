'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { saveCustomerAction } from '../invoices/actions';

export type CustomerValues = {
  id?: number;
  name: string;
  organisation: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
  notes: string | null;
};

/** Customer fields; prefix "new_" when embedded in the invoice form. */
export function CustomerFields({ v, prefix = '' }: { v?: Partial<CustomerValues>; prefix?: string }) {
  return (
    <>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Name</span>
          <input className={f.input} name={`${prefix}name`} defaultValue={v?.name ?? ''} maxLength={200} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Business (optional)</span>
          <input className={f.input} name={`${prefix}organisation`} defaultValue={v?.organisation ?? ''} maxLength={200} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Email</span>
          <input className={f.input} type="email" name={`${prefix}email`} defaultValue={v?.email ?? ''} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} type="tel" name={`${prefix}phone`} defaultValue={v?.phone ?? ''} maxLength={40} />
        </label>
      </div>
      <label className={f.field}>
        <span className={f.label}>Address</span>
        <textarea className={f.textarea} name={`${prefix}address`} rows={3} defaultValue={v?.address ?? ''} maxLength={500} />
      </label>
      <label className={f.field}>
        <span className={f.label}>Their VAT number (optional)</span>
        <input className={f.input} name={`${prefix}vat_number`} defaultValue={v?.vat_number ?? ''} maxLength={20} />
      </label>
    </>
  );
}

export function CustomerForm({ v }: { v?: CustomerValues }) {
  const [state, action, pending] = useActionState(saveCustomerAction, emptyFormState);
  return (
    <form action={action} className={s.form}>
      {v?.id && <input type="hidden" name="customer_id" value={v.id} />}
      <CustomerFields v={v} />
      <label className={f.field}>
        <span className={f.label}>Notes (only you see these)</span>
        <textarea className={f.textarea} name="notes" rows={2} defaultValue={v?.notes ?? ''} maxLength={2000} />
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && state.message && <p className={f.success}>{state.message}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : v?.id ? 'Save customer' : 'Add customer'}
        </button>
      </div>
    </form>
  );
}
