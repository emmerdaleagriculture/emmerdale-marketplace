'use client';

import { useActionState, useMemo, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import { VAT_CODES, type VatCode } from '@/lib/books/vat';
import f from '@/components/forms/forms.module.css';
import m from '../../../market/market.module.css';
import s from '../../books.module.css';
import { importRowsAction } from '../actions';

export type ImportRow = {
  date: string;
  payee: string;
  description: string;
  amount: number;
  /** waiting: a Stripe payout the Stripe sync will book. */
  status: 'imported' | 'matched' | 'new' | 'waiting';
  matchLabel?: string;
  registered: boolean;
  suggestion: { account: string; vat: VatCode; check: boolean; why: string } | null;
  /** How an imported row went in; editable when this statement page booked it. */
  booked: { account: string | null; vat: VatCode; check: boolean; why: string | null; editable: boolean } | null;
};
type Acc = { code: string; name: string; group: 'income' | 'expense' | 'asset' | 'other' };
type Inv = { id: number; number: string; customer: string; due_pence: number };

const PNL_VAT: VatCode[] = ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'BLOCKED'];
const vatLabel = (c: VatCode) => (c === 'STD' ? '20%' : c === 'RED' ? '5%' : c === 'ZERO' ? '0%' : VAT_CODES[c].label.split(/[ (/]/)[0]);

/**
 * The statement's rows, already booked. Rows filed by AI (new payees) come
 * first and are highlighted; change where any booked row went and save.
 */
export function ImportTable({
  statementId,
  rows,
  accounts,
  invoices,
  canEdit,
}: {
  statementId: number;
  rows: ImportRow[];
  accounts: Acc[];
  invoices: Inv[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(importRowsAction, emptyFormState);
  const initial = useMemo(
    () =>
      rows.map((r) => ({
        account: r.booked?.account ?? r.suggestion?.account ?? (r.amount > 0 ? '4900' : '6990'),
        vat: r.booked?.vat ?? r.suggestion?.vat ?? ((r.registered ? 'STD' : 'NOVAT') as VatCode),
      })),
    [rows],
  );
  const [picks, setPicks] = useState(initial);
  const [showAll, setShowAll] = useState(false);
  const pnl = useMemo(() => new Set(accounts.filter((a) => a.group === 'income' || a.group === 'expense').map((a) => a.code)), [accounts]);
  const set = (i: number, patch: Partial<(typeof picks)[number]>) => setPicks(picks.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const editable = (r: ImportRow) => r.status === 'new' || (r.status === 'imported' && Boolean(r.booked?.editable));
  const needsLook = (r: ImportRow) => r.status === 'new' || Boolean(r.booked?.check);
  const changed = (i: number) => picks[i].account !== initial[i].account || picks[i].vat !== initial[i].vat;
  // Saving sends every row changed, and every highlighted one (looked at now, so no longer a guess).
  const sending = rows.flatMap((r, i) => (canEdit && editable(r) && (changed(i) || needsLook(r)) ? [i] : []));
  const payload = JSON.stringify(sending.map((i) => ({ row: i, account: picks[i].account, vat: pnl.has(picks[i].account) ? picks[i].vat : 'OUTSIDE' })));
  const lookN = rows.filter(needsLook).length;
  const order = rows.map((r, i) => ({ r, i })).sort((a, b) => Number(needsLook(b.r)) - Number(needsLook(a.r)) || a.i - b.i);
  const visible = order.filter(({ r, i }) => showAll || needsLook(r) || changed(i));

  const groups: [string, Acc[]][] = [
    ['Income', accounts.filter((a) => a.group === 'income')],
    ['Expenses', accounts.filter((a) => a.group === 'expense')],
    ['Fixed assets', accounts.filter((a) => a.group === 'asset')],
    ['Transfers and other accounts', accounts.filter((a) => a.group === 'other')],
  ];

  return (
    <form action={action}>
      <input type="hidden" name="statement_id" value={statementId} />
      <input type="hidden" name="picks" value={payload} />
      <div className={s.actions} style={{ alignItems: 'center' }}>
        <span className={m.sub} style={{ margin: 0 }}>
          {lookN === 0 ? 'Nothing needs a look.' : `${lookN} row${lookN === 1 ? '' : 's'} worth a glance`}
          {!showAll && ` · ${rows.length - lookN} more booked`}
        </span>
        <button type="button" className={f.btnGhost} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show only rows worth a glance' : `Show all ${rows.length} rows`}
        </button>
      </div>
      {visible.length > 0 && (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th className={m.num}>Amount</th>
                <th>Goes to</th>
                <th>VAT</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ r, i }) => {
                const p = picks[i];
                const canChange = canEdit && editable(r);
                const money = r.amount > 0;
                const invs = money && r.status === 'new' ? invoices.filter((v) => v.due_pence >= r.amount) : [];
                return (
                  <tr key={i} className={needsLook(r) && !changed(i) ? s.flagged : undefined}>
                    <td>{ukDate(r.date)}</td>
                    <td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 160 }}>
                      {r.payee}
                      {r.description && <div className={s.muted}>{r.description}</div>}
                    </td>
                    <td className={m.num}>{formatPence(r.amount)}</td>
                    <td style={{ minWidth: 200 }}>
                      {r.status === 'waiting' ? (
                        <span className={s.muted}>Your Stripe sync books this payout</span>
                      ) : r.status === 'matched' ? (
                        <span className={s.muted}>Already in your books: {r.matchLabel}</span>
                      ) : !canChange ? (
                        <span className={s.muted}>
                          In your books{r.booked?.account ? `: ${r.booked.account} ${accounts.find((a) => a.code === r.booked!.account)?.name ?? ''}` : ''}
                        </span>
                      ) : (
                        <>
                          <select className={f.input} value={p.account} onChange={(e) => set(i, { account: e.target.value })} aria-label="Account">
                            {invs.length > 0 && (
                              <optgroup label="Payment of an invoice">
                                {invs.map((v) => (
                                  <option key={v.id} value={`inv:${v.id}`}>
                                    Invoice {v.number} · {v.customer} ({formatPence(v.due_pence)} due)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {groups.map(([label, list]) =>
                              list.length ? (
                                <optgroup key={label} label={label}>
                                  {list.map((a) => (
                                    <option key={a.code} value={a.code}>
                                      {a.code} {a.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null,
                            )}
                          </select>
                          {!changed(i) && r.booked?.check && <div className={s.muted}>{r.booked.why ?? 'A guess: check this'}</div>}
                          {r.status === 'new' && <div className={s.muted}>Not in your books yet</div>}
                        </>
                      )}
                    </td>
                    <td style={{ width: 100 }}>
                      {canChange && r.registered && pnl.has(p.account) && (
                        <select className={f.input} value={p.vat} onChange={(e) => set(i, { vat: e.target.value as VatCode })} aria-label="VAT">
                          {PNL_VAT.map((c) => (
                            <option key={c} value={c}>
                              {vatLabel(c)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {state.error && <p className={f.error}>{state.error}</p>}
      {canEdit && sending.length > 0 && (
        <div className={s.actions}>
          <button className={f.btnPrimary} type="submit" disabled={pending}>
            {pending ? 'Saving…' : lookN > 0 ? 'Save: these look right now' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  );
}
