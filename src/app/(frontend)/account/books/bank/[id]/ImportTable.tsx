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
  status: 'imported' | 'matched' | 'new';
  matchLabel?: string;
  registered: boolean;
  suggestion: { account: string; vat: VatCode; check: boolean; why: string } | null;
};
type Acc = { code: string; name: string; group: 'income' | 'expense' | 'asset' | 'other' };
type Inv = { id: number; number: string; customer: string; due_pence: number };

const PNL_VAT: VatCode[] = ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'BLOCKED'];
const vatLabel = (c: VatCode) => (c === 'STD' ? '20%' : c === 'RED' ? '5%' : c === 'ZERO' ? '0%' : VAT_CODES[c].label.split(/[ (/]/)[0]);

/** The statement's rows: tick, choose where each goes, import. */
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
  const [picks, setPicks] = useState(() =>
    rows.map((r) => ({ on: r.status === 'new', account: r.suggestion?.account ?? (r.amount > 0 ? '4900' : '6990'), vat: r.suggestion?.vat ?? ((r.registered ? 'STD' : 'NOVAT') as VatCode) })),
  );
  const [showAll, setShowAll] = useState(false);
  const pnl = useMemo(() => new Set(accounts.filter((a) => a.group === 'income' || a.group === 'expense').map((a) => a.code)), [accounts]);
  const set = (i: number, patch: Partial<(typeof picks)[number]>) => setPicks(picks.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const todo = rows.filter((r) => r.status !== 'imported').length;
  const ticked = picks.filter((p, i) => p.on && rows[i].status !== 'imported');
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => showAll || r.status !== 'imported');
  const payload = JSON.stringify(picks.flatMap((p, i) => (p.on && rows[i].status !== 'imported' ? [{ row: i, account: p.account, vat: pnl.has(p.account) ? p.vat : 'OUTSIDE' }] : [])));

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
          {todo === 0 ? 'Every row is in your books.' : `${todo} row${todo === 1 ? '' : 's'} not imported · ${ticked.length} ticked`}
        </span>
        {rows.length > todo && (
          <button type="button" className={f.btnGhost} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide imported rows' : 'Show imported rows too'}
          </button>
        )}
      </div>
      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th aria-label="Import" />
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
              const done = r.status === 'imported';
              const money = r.amount > 0;
              const invs = money ? invoices.filter((v) => v.due_pence >= r.amount) : [];
              const flagged = !done && p.on && r.suggestion?.check && p.account === r.suggestion.account;
              return (
                <tr key={i} className={flagged ? s.flagged : undefined}>
                  <td>
                    {!done && canEdit && (
                      <input type="checkbox" checked={p.on} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Import ${r.payee}`} />
                    )}
                  </td>
                  <td>{ukDate(r.date)}</td>
                  <td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 160 }}>
                    {r.payee}
                    {r.description && <div className={s.muted}>{r.description}</div>}
                  </td>
                  <td className={m.num}>{formatPence(r.amount)}</td>
                  <td style={{ minWidth: 200 }}>
                    {done ? (
                      <span className={s.muted}>In your books</span>
                    ) : (
                      <>
                        {r.status === 'matched' && <div className={s.muted}>Already in your books: {r.matchLabel}</div>}
                        {canEdit && (
                          <select className={f.input} value={p.account} onChange={(e) => set(i, { account: e.target.value, on: true })} aria-label="Account">
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
                        )}
                        {r.suggestion && p.account === r.suggestion.account && r.status === 'new' && (
                          <div className={s.muted}>{r.suggestion.check ? 'A guess: check this' : r.suggestion.why}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ width: 100 }}>
                    {!done && canEdit && r.registered && pnl.has(p.account) && (
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
      {state.error && <p className={f.error}>{state.error}</p>}
      {canEdit && todo > 0 && (
        <div className={s.actions}>
          <button className={f.btnPrimary} type="submit" disabled={pending || ticked.length === 0}>
            {pending ? 'Importing…' : `Import ${ticked.length} ticked row${ticked.length === 1 ? '' : 's'}`}
          </button>
          <button type="button" className={f.btnGhost} onClick={() => setPicks(picks.map((p) => ({ ...p, on: false })))}>
            Untick all
          </button>
        </div>
      )}
    </form>
  );
}
