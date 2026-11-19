'use client';

import { useActionState, useState } from 'react';
import { emptyFormState, type FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from './books.module.css';

export type SettingsValues = {
  business_type: string;
  legal_name: string;
  company_number: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  vat_scheme: string;
  vat_quarter_stagger: number;
  flat_rate_percent: number | null;
  vat_registration_date: string | null;
  year_end: string | null;
  farming: boolean;
  default_payment_account: string;
  trading_name: string | null;
  address: string | null;
  phone: string | null;
  invoice_reply_to: string | null;
  bank_details: string | null;
  invoice_terms_days: number;
  invoice_footer: string | null;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Books settings. Used twice: to set the books up (setup = true: business
 * type and farming chart are chosen once, and the invoicing details can wait)
 * and on the Settings page.
 */
export function SettingsForm({
  action,
  values,
  setup,
  paymentAccounts,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  values: SettingsValues;
  setup: boolean;
  paymentAccounts: { code: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const [type, setType] = useState(values.business_type);
  const [vat, setVat] = useState(values.vat_registered);
  const [scheme, setScheme] = useState(values.vat_scheme);
  const [ym, yd] = (values.year_end ?? '').split('-');

  return (
    <form action={formAction} className={s.form}>
      <fieldset className={s.fieldset}>
        <legend>Your business</legend>
        {setup ? (
          <label className={f.field}>
            <span className={f.label}>Business type</span>
            <select className={f.input} name="business_type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="sole_trader">Sole trader</option>
              <option value="partnership">Partnership</option>
              <option value="limited_company">Limited company</option>
            </select>
            <span className={f.hint}>This sets up the right accounts for paying yourself. It can’t be changed later.</span>
          </label>
        ) : (
          <input type="hidden" name="business_type" value={values.business_type} />
        )}
        <label className={f.field}>
          <span className={f.label}>Legal name</span>
          <input className={f.input} name="legal_name" defaultValue={values.legal_name} required maxLength={200} />
          <span className={f.hint}>Your own name as a sole trader, or the company’s registered name.</span>
        </label>
        {type === 'limited_company' && (
          <label className={f.field}>
            <span className={f.label}>Company number</span>
            <input className={f.input} name="company_number" defaultValue={values.company_number ?? ''} maxLength={10} />
          </label>
        )}
        <div className={s.row2}>
          <label className={f.field}>
            <span className={f.label}>Accounting year ends (month)</span>
            <select className={f.input} name="year_end_month" defaultValue={ym ?? ''}>
              <option value="">Not set</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={String(i + 1).padStart(2, '0')}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={f.field}>
            <span className={f.label}>Day</span>
            <input className={f.input} name="year_end_day" type="number" min={1} max={31} defaultValue={yd ? Number(yd) : ''} />
            <span className={f.hint}>A sole trader’s is usually 5 April or 31 March.</span>
          </label>
        </div>
        {setup ? (
          <label className={f.checkRow}>
            <input type="checkbox" name="farming" defaultChecked={values.farming} />
            <span>Include farming accounts (machinery, farm fuel, seed, feed, crop sales…)</span>
          </label>
        ) : (
          <input type="hidden" name="farming" value={values.farming ? 'on' : ''} />
        )}
        {!setup && (
          <label className={f.field}>
            <span className={f.label}>Usually paid from</span>
            <select className={f.input} name="default_payment_account" defaultValue={values.default_payment_account}>
              {paymentAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend>VAT</legend>
        <label className={f.checkRow}>
          <input type="checkbox" name="vat_registered" checked={vat} onChange={(e) => setVat(e.target.checked)} />
          <span>VAT registered</span>
        </label>
        {vat && (
          <>
            <div className={s.row2}>
              <label className={f.field}>
                <span className={f.label}>VAT number</span>
                <input className={f.input} name="vat_number" defaultValue={values.vat_number ?? ''} maxLength={16} />
              </label>
              <label className={f.field}>
                <span className={f.label}>Registered from</span>
                <input className={f.input} name="vat_registration_date" type="date" defaultValue={values.vat_registration_date ?? ''} />
              </label>
            </div>
            <div className={s.row2}>
              <label className={f.field}>
                <span className={f.label}>Scheme</span>
                <select className={f.input} name="vat_scheme" value={scheme} onChange={(e) => setScheme(e.target.value)}>
                  <option value="standard">Standard (accrual)</option>
                  <option value="cash">Cash accounting</option>
                  <option value="flat_rate">Flat rate</option>
                </select>
              </label>
              <label className={f.field}>
                <span className={f.label}>VAT quarters end in</span>
                <select className={f.input} name="vat_quarter_stagger" defaultValue={values.vat_quarter_stagger}>
                  <option value={0}>Mar, Jun, Sep, Dec</option>
                  <option value={1}>Jan, Apr, Jul, Oct</option>
                  <option value={2}>Feb, May, Aug, Nov</option>
                </select>
              </label>
              {scheme === 'flat_rate' && (
                <label className={f.field}>
                  <span className={f.label}>Flat rate %</span>
                  <input className={f.input} name="flat_rate_percent" inputMode="decimal" defaultValue={values.flat_rate_percent ?? ''} />
                </label>
              )}
            </div>
          </>
        )}
        {!vat && <p className={f.hint}>Not registered: your sales won’t charge VAT, but VAT you pay is still recorded so it can be reclaimed if you register.</p>}
      </fieldset>

      {!setup && (
        <fieldset className={s.fieldset}>
          <legend>Invoices</legend>
          <p className={f.hint}>Shown on the invoices you send from Books (coming soon).</p>
          <label className={f.field}>
            <span className={f.label}>Trading name</span>
            <input className={f.input} name="trading_name" defaultValue={values.trading_name ?? ''} maxLength={200} />
          </label>
          <label className={f.field}>
            <span className={f.label}>Postal address</span>
            <textarea className={f.textarea} name="address" rows={3} defaultValue={values.address ?? ''} maxLength={500} />
          </label>
          <div className={s.row2}>
            <label className={f.field}>
              <span className={f.label}>Phone</span>
              <input className={f.input} name="phone" type="tel" defaultValue={values.phone ?? ''} maxLength={40} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Replies go to</span>
              <input className={f.input} name="invoice_reply_to" type="email" defaultValue={values.invoice_reply_to ?? ''} />
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Bank details for payment</span>
            <textarea className={f.textarea} name="bank_details" rows={3} defaultValue={values.bank_details ?? ''} maxLength={500} />
          </label>
          <div className={s.row2}>
            <label className={f.field}>
              <span className={f.label}>Payment terms (days)</span>
              <input className={f.input} name="invoice_terms_days" type="number" min={0} max={120} defaultValue={values.invoice_terms_days} />
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Invoice footer</span>
            <textarea className={f.textarea} name="invoice_footer" rows={2} defaultValue={values.invoice_footer ?? ''} maxLength={1000} />
          </label>
        </fieldset>
      )}

      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && state.message && <p className={f.success}>{state.message}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : setup ? 'Set up my books' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
