'use client';

import { useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { VAT_CODES, type VatCode } from '@/lib/books/vat';
import f from '@/components/forms/forms.module.css';
import s from '../../books.module.css';
import { reviewReceiptAction } from '../actions';

type Opt = { code: string; name: string };
type Values = {
  doc_type: string;
  doc_date: string;
  counterparty: string;
  counterparty_vat_number: string;
  reference: string;
  description: string;
  gross: string;
  vat: string;
  net: string;
  vat_code: string;
  account_code: string;
  payment_account_code: string;
};

/** The review form: what the AI read, editable, then Save or Post. */
export function ReceiptForm({
  receiptId,
  values,
  purchaseAccounts,
  saleAccounts,
  paymentAccounts,
  vatCodes,
}: {
  receiptId: number;
  values: Values;
  purchaseAccounts: Opt[];
  saleAccounts: Opt[];
  paymentAccounts: Opt[];
  vatCodes: VatCode[];
}) {
  const [state, action, pending] = useActionState(reviewReceiptAction, emptyFormState);
  const [kind, setKind] = useState(values.doc_type === 'sale' ? 'sale' : 'purchase');
  const categories = kind === 'sale' ? saleAccounts : purchaseAccounts;
  const defaultCategory = categories.some((a) => a.code === values.account_code) ? values.account_code : '';

  return (
    <form action={action} className={s.form}>
      <input type="hidden" name="receipt_id" value={receiptId} />
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Type</span>
          <select className={f.input} name="doc_type" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="purchase">Expense (we bought)</option>
            <option value="sale">Sale (we sold)</option>
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Date</span>
          <input className={f.input} type="date" name="doc_date" defaultValue={values.doc_date} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>{kind === 'sale' ? 'Customer' : 'Supplier'}</span>
          <input className={f.input} name="counterparty" defaultValue={values.counterparty} maxLength={200} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Their VAT number</span>
          <input className={f.input} name="counterparty_vat_number" defaultValue={values.counterparty_vat_number} maxLength={20} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Reference</span>
          <input className={f.input} name="reference" defaultValue={values.reference} maxLength={100} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Description</span>
          <input className={f.input} name="description" defaultValue={values.description} maxLength={300} />
        </label>
      </div>
      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>Total (£)</span>
          <input className={f.input} name="gross" inputMode="decimal" defaultValue={values.gross} />
        </label>
        <label className={f.field}>
          <span className={f.label}>VAT (£)</span>
          <input className={f.input} name="vat" inputMode="decimal" defaultValue={values.vat} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Net (£)</span>
          <input className={f.input} name="net" inputMode="decimal" defaultValue={values.net} />
        </label>
      </div>
      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>VAT code</span>
          <select className={f.input} name="vat_code" defaultValue={values.vat_code}>
            {vatCodes.map((c) => (
              <option key={c} value={c}>
                {VAT_CODES[c].label}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Category</span>
          <select className={f.input} name="account_code" defaultValue={defaultCategory} key={kind}>
            <option value="">Choose…</option>
            {categories.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>{kind === 'sale' ? 'Paid into' : 'Paid from'}</span>
          <select className={f.input} name="payment_account_code" defaultValue={values.payment_account_code}>
            {paymentAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && state.message && <p className={f.success}>{state.message}</p>}
      <div className={s.actions}>
        <button className={f.btnPrimary} type="submit" name="intent" value="post" disabled={pending}>
          {pending ? 'Working…' : 'Post to books'}
        </button>
        <button className={f.btnGhost} type="submit" name="intent" value="save" disabled={pending}>
          Save for later
        </button>
      </div>
    </form>
  );
}
