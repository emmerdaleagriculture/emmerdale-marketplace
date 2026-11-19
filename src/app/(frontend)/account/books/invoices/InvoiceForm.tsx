'use client';

import { useActionState, useMemo, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { addDays, isIsoDate } from '@/lib/books/period';
import { formatPence, parsePounds } from '@/lib/books/money';
import { invoiceTotals, priceLine } from '@/lib/books/invoice';
import { VAT_CODES, type VatCode } from '@/lib/books/vat';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { CustomerFields } from '../customers/CustomerForm';
import { saveInvoiceAction } from './actions';

type Opt = { code: string; name: string };
export type DraftLine = { description: string; quantity: string; unit: string; vat_code: string; account_code: string };


/**
 * New or draft invoice: customer (existing or new), number, dates, lines
 * with live totals. VAT per line only when registered on the issue date.
 */
export function InvoiceForm({
  invoiceId,
  customers,
  incomeAccounts,
  values,
  termsDays,
  registeredFrom,
}: {
  invoiceId?: number;
  customers: { id: number; name: string; organisation: string | null }[];
  incomeAccounts: Opt[];
  values: { customer_id: number | null; number: string; issue_date: string; due_date: string; notes: string; lines: DraftLine[] };
  termsDays: number;
  /** Registered from this date (or null = not registered). */
  registeredFrom: string | null;
}) {
  const [state, action, pending] = useActionState(saveInvoiceAction, emptyFormState);
  const [customer, setCustomer] = useState(values.customer_id ? String(values.customer_id) : customers.length ? '' : 'new');
  const [issue, setIssue] = useState(values.issue_date);
  const [due, setDue] = useState(values.due_date);
  const [lines, setLines] = useState<DraftLine[]>(values.lines);
  const registered = registeredFrom != null && issue >= registeredFrom;

  const priced = useMemo(
    () =>
      lines.map((l) =>
        priceLine(
          { description: l.description, quantity: Number(l.quantity) || 0, unit_pence: parsePounds(l.unit) ?? 0, vat_code: l.vat_code, account_code: l.account_code },
          registered,
        ),
      ),
    [lines, registered],
  );
  const totals = invoiceTotals(priced);
  const set = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className={s.form} style={{ maxWidth: 820 }}>
      {invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <fieldset className={s.fieldset}>
        <legend>Customer</legend>
        <label className={f.field}>
          <span className={f.label}>Bill to</span>
          <select className={f.input} name="customer_id" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="" disabled>
              Choose a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.organisation ? ` (${c.organisation})` : ''}
              </option>
            ))}
            <option value="new">+ New customer</option>
          </select>
        </label>
        {customer === 'new' && <CustomerFields prefix="new_" />}
      </fieldset>

      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>Invoice number</span>
          <input className={f.input} name="number" defaultValue={values.number} maxLength={20} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Issue date</span>
          <input
            className={f.input}
            type="date"
            name="issue_date"
            value={issue}
            onChange={(e) => {
              setIssue(e.target.value);
              if (isIsoDate(e.target.value)) setDue(addDays(e.target.value, termsDays));
            }}
            required
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Due date</span>
          <input className={f.input} type="date" name="due_date" value={due} onChange={(e) => setDue(e.target.value)} required />
        </label>
      </div>

      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th>Description</th>
              <th className={m.num}>Qty</th>
              <th className={m.num}>Price (£)</th>
              {registered && <th>VAT</th>}
              {incomeAccounts.length > 1 && <th>Account</th>}
              <th className={m.num}>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ minWidth: 200 }}>
                  <input className={f.input} value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label="Description" maxLength={500} />
                </td>
                <td style={{ width: 80 }}>
                  <input className={f.input} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" aria-label="Quantity" />
                </td>
                <td style={{ width: 110 }}>
                  <input className={f.input} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} inputMode="decimal" aria-label="Price" />
                </td>
                {registered && (
                  <td style={{ width: 120 }}>
                    <select className={f.input} value={l.vat_code} onChange={(e) => set(i, { vat_code: e.target.value })} aria-label="VAT">
                      {(['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE'] as VatCode[]).map((c) => (
                        <option key={c} value={c}>
                          {c === 'STD' ? '20%' : c === 'RED' ? '5%' : c === 'ZERO' ? '0%' : VAT_CODES[c].label.split(' ')[0]}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                {incomeAccounts.length > 1 && (
                  <td style={{ width: 170 }}>
                    <select className={f.input} value={l.account_code} onChange={(e) => set(i, { account_code: e.target.value })} aria-label="Income account">
                      {incomeAccounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className={m.num}>{formatPence(priced[i]?.net_pence ?? 0)}</td>
                <td>
                  {lines.length > 1 && (
                    <button type="button" className={s.voidBtn} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button
          type="button"
          className={f.btnGhost}
          onClick={() => setLines([...lines, { description: '', quantity: '1', unit: '', vat_code: lines.at(-1)?.vat_code ?? 'STD', account_code: lines.at(-1)?.account_code ?? '4000' }])}
        >
          Add a line
        </button>
      </div>
      <p className={m.sub} style={{ textAlign: 'right', margin: 0 }}>
        {registered ? (
          <>
            Subtotal {formatPence(totals.net_pence)} · VAT {formatPence(totals.vat_pence)} ·{' '}
          </>
        ) : null}
        <b>Total {formatPence(totals.gross_pence)}</b>
        {!registered && <span className={s.muted}> (no VAT: not registered on this date)</span>}
      </p>
      <label className={f.field}>
        <span className={f.label}>Notes on the invoice (optional)</span>
        <textarea className={f.textarea} name="notes" rows={2} defaultValue={values.notes} maxLength={2000} />
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </form>
  );
}
