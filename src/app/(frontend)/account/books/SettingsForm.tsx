'use client';

import { startTransition, useActionState, useState } from 'react';
import { emptyFormState, type FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from './books.module.css';
import { CopyText } from './CopyText';

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
  inbound_senders: string[];
  marketplace_auto: boolean;
  marketplace_from: string | null;
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
  receiptsAddress,
  accountEmail,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  values: SettingsValues;
  setup: boolean;
  paymentAccounts: { code: string; name: string }[];
  receiptsAddress?: string;
  accountEmail?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const [type, setType] = useState(values.business_type);
  const [vat, setVat] = useState(values.vat_registered);
  const [scheme, setScheme] = useState(values.vat_scheme);
  const [ym, yd] = (values.year_end ?? '').split('-');

  return (
    <form
      className={s.form}
      // Submitted by hand, not through the action prop: React resets a form
      // after its action runs, and the controlled selects and tick boxes
      // (business type, VAT) then showed their first-loaded values again.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <fieldset className={s.fieldset}>
        <legend>Your business</legend>
        <label className={f.field}>
          <span className={f.label}>Business type</span>
          <select className={f.input} name="business_type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="sole_trader">Sole trader</option>
            <option value="partnership">Partnership</option>
            <option value="limited_company">Limited company</option>
          </select>
          <span className={f.hint}>
            {setup
              ? 'This sets up the right accounts for paying yourself.'
              : type !== values.business_type
                ? 'Saving adds the right accounts for paying yourself. Entries you’ve already posted stay as they are.'
                : 'Sets the accounts for paying yourself: a director’s loan for a company, drawings otherwise.'}
          </span>
        </label>
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

      {!setup && receiptsAddress && (
        <fieldset className={s.fieldset}>
          <legend>Receipts by email</legend>
          <div className={f.hint}>
            <p style={{ margin: 0 }}>Forward receipts and invoices to:</p>
            <CopyText text={receiptsAddress} />
            <p style={{ margin: 0 }}>
              Attachments (PDFs and photos) are read by AI; an email with none, like most online order confirmations, is read itself.
            </p>
          </div>
          <label className={f.field}>
            <span className={f.label}>Other addresses you send from</span>
            <textarea className={f.textarea} name="inbound_senders" rows={3} defaultValue={values.inbound_senders.join('\n')} />
            <span className={f.hint}>
              One per line. {accountEmail ? `${accountEmail} is always allowed. ` : ''}Mail from anyone else waits in your
              receipts unread until you choose to read it.
            </span>
          </label>
        </fieldset>
      )}
      {setup && <input type="hidden" name="inbound_senders" value="" />}
      {!setup && !receiptsAddress && <input type="hidden" name="inbound_senders" value={values.inbound_senders.join('\n')} />}

      {!setup && (
        <fieldset className={s.fieldset}>
          <legend>Invoices</legend>
          <p className={f.hint}>Shown on the invoices you send from Books.</p>
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

      <fieldset className={s.fieldset}>
        <legend>Emmerdale jobs</legend>
        <label className={f.checkRow}>
          <input type="checkbox" name="marketplace_auto" defaultChecked={values.marketplace_auto} />
          <span>Book the jobs I do through Emmerdale automatically</span>
        </label>
        <p className={f.hint}>
          When a customer signs off a job, it goes in as a sale to Emmerdale Agriculture Online Ltd at your
          price, and our payment to you clears it. Our fee is never your cost, so it doesn’t appear.
        </p>
        <label className={f.field}>
          <span className={f.label}>Book jobs finished on or after</span>
          <input className={f.input} name="marketplace_from" type="date" defaultValue={values.marketplace_from ?? ''} style={{ maxWidth: 220 }} />
          <span className={f.hint}>
            Leave blank to start {setup ? 'today' : 'from the day you set up your books'}. Choose an earlier date
            to bring in jobs already done this year, unless they’re already in your figures.
          </span>
        </label>
      </fieldset>

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
