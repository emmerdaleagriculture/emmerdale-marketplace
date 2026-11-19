'use client';

import { useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { postPreRegAction } from './actions';

type Row = { id: number; entry_date: string; counterparty: string | null; description: string | null; vat_pence: number; eligible: boolean; why: string };

/** Tick the earlier purchases to reclaim; eligible services are ticked, goods are for the owner to confirm. */
export function PreRegForm({ rows }: { rows: Row[] }) {
  const [state, action, pending] = useActionState(postPreRegAction, emptyFormState);
  const [ticked, setTicked] = useState<Set<number>>(() => new Set());
  const total = rows.filter((r) => ticked.has(r.id)).reduce((t, r) => t + r.vat_pence, 0);
  return (
    <form action={action}>
      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th />
              <th>Date</th>
              <th>From</th>
              <th className={m.num}>VAT</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.eligible ? undefined : s.muted}>
                <td>
                  <input
                    type="checkbox"
                    name="entry_id"
                    value={r.id}
                    disabled={!r.eligible}
                    checked={ticked.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(ticked);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setTicked(next);
                    }}
                    aria-label={`Reclaim VAT on ${r.counterparty ?? r.description ?? 'this purchase'}`}
                  />
                </td>
                <td>{ukDate(r.entry_date)}</td>
                <td style={{ whiteSpace: 'normal' }}>{r.counterparty ?? r.description ?? ''}</td>
                <td className={m.num}>{formatPence(r.vat_pence)}</td>
                <td style={{ whiteSpace: 'normal' }} className={s.muted}>
                  {r.why}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div className={s.actions} style={{ marginTop: 12 }}>
        <button className={f.btnPrimary} type="submit" disabled={pending || ticked.size === 0}>
          {pending ? 'Posting…' : `Reclaim ${formatPence(total)}`}
        </button>
      </div>
    </form>
  );
}
