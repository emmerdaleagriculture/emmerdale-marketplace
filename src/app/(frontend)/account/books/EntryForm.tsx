'use client';

import { useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { parsePounds, penceToDecimal, vatInGross } from '@/lib/books/money';
import { VAT_CODES, type VatCode } from '@/lib/books/vat';
import f from '@/components/forms/forms.module.css';
import s from './books.module.css';
import { postEntryAction } from './actions';

type Opt = { code: string; name: string };

/**
 * Record a sale or an expense by hand. Type the total and pick a VAT code;
 * the VAT and net fill in from the rate and can be overwritten to match the
 * document exactly.
 */
export function EntryForm({
  kind,
  today,
  categories,
  payments,
  defaultCategory,
  defaultPayment,
  vatCodes,
  defaultVat,
}: {
  kind: 'sale' | 'purchase';
  today: string;
  categories: Opt[];
  payments: Opt[];
  defaultCategory: string;
  defaultPayment: string;
  vatCodes: VatCode[];
  defaultVat: VatCode;
}) {
  const [state, action, pending] = useActionState(postEntryAction, emptyFormState);
  const [gross, setGross] = useState('');
  const [vatCode, setVatCode] = useState<VatCode>(defaultVat);
  const [vat, setVat] = useState('');
  const [vatTouched, setVatTouched] = useState(false);

  const g = parsePounds(gross);
  const autoVat = g != null && g > 0 ? vatInGross(g, vatCode === 'RC' ? 0 : VAT_CODES[vatCode].rate) : null;
  const shownVat = vatTouched ? vat : autoVat != null ? penceToDecimal(autoVat) : '';
  const v = parsePounds(shownVat) ?? 0;
  const net = g != null ? penceToDecimal(g - v) : '';

  return (
    <form action={action} className={s.form}>
      <input type="hidden" name="kind" value={kind} />
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Date</span>
          <input className={f.input} type="date" name="date" defaultValue={today} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>{kind === 'sale' ? 'Customer' : 'Supplier'}</span>
          <input className={f.input} name="counterparty" maxLength={200} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Reference</span>
          <input className={f.input} name="reference" maxLength={100} placeholder="Invoice or receipt number" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Description</span>
          <input className={f.input} name="description" maxLength={300} />
        </label>
      </div>
      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>Total (£)</span>
          <input className={f.input} name="gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>VAT (£)</span>
          <input
            className={f.input}
            name="vat"
            inputMode="decimal"
            value={shownVat}
            onChange={(e) => {
              setVatTouched(true);
              setVat(e.target.value);
            }}
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Net (£)</span>
          <input className={f.input} name="net" value={net} readOnly tabIndex={-1} />
        </label>
      </div>
      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>VAT code</span>
          <select
            className={f.input}
            name="vat_code"
            value={vatCode}
            onChange={(e) => {
              setVatCode(e.target.value as VatCode);
              setVatTouched(false);
            }}
          >
            {vatCodes.map((c) => (
              <option key={c} value={c}>
                {VAT_CODES[c].label}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Category</span>
          <select className={f.input} name="account_code" defaultValue={defaultCategory}>
            {categories.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>{kind === 'sale' ? 'Paid into' : 'Paid from'}</span>
          <select className={f.input} name="payment_code" defaultValue={defaultPayment}>
            {payments.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {vatCode === 'RC' && <p className={f.hint}>Reverse charge: enter what the overseas supplier charged as the total, with no VAT.</p>}
      {state.error && <p className={f.error}>{state.error}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Posting…' : kind === 'sale' ? 'Record sale' : 'Record expense'}
        </button>
      </div>
    </form>
  );
}
