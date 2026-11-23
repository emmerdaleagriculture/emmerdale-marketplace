'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { EntryWithLines } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import s from './books.module.css';
import { voidEntryAction } from './actions';

const SOURCE: Record<string, string> = {
  manual: 'Entered by hand',
  mileage: 'Mileage claim',
  receipt: 'From a receipt',
  email: 'From an emailed receipt',
  bank: 'From a bank statement',
  marketplace: 'Emmerdale job',
  stripe: 'Stripe',
  invoice: 'Invoice',
};

const KIND: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Expense',
  journal: 'Journal',
};

/**
 * One entry in a list (overview, journal): the row is a button, and a click
 * opens the whole entry in a modal, with Void there for entries a person may void.
 */
export function EntryModal({
  entry: e,
  canVoid,
  className,
  children,
}: {
  entry: EntryWithLines;
  canVoid: boolean;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The journal lists hundreds of entries: build a modal's contents only once it is opened.
  const [shown, setShown] = useState(false);
  const open = () => {
    setShown(true);
    dialog.current?.showModal();
  };
  const title = e.counterparty || e.description || KIND[e.kind] || 'Entry';
  const vat = e.vat_pence !== 0 || e.net_pence !== e.gross_pence;
  const rows: [string, ReactNode][] = [
    ['Date', ukDate(e.entry_date)],
    ['Type', `${KIND[e.kind] ?? e.kind}${e.is_capital ? ' (capital)' : ''}`],
    ...(e.counterparty && e.description ? ([['Description', e.description]] as [string, ReactNode][]) : []),
    ...(e.reference ? ([['Reference', e.reference]] as [string, ReactNode][]) : []),
    ...(vat
      ? ([
          ['Net', formatPence(e.net_pence)],
          ['VAT', formatPence(e.vat_pence)],
        ] as [string, ReactNode][])
      : []),
    ['Total', <b key="t">{formatPence(e.gross_pence)}</b>],
    ['VAT code', e.vat_code],
    ['Recorded', SOURCE[e.source] ?? e.source],
  ];

  return (
    <>
      {/* A div, not a <button>: the journal's rows hold a table. */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        className={`${s.entryOpen} ${className ?? ''}`}
        onClick={open}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            open();
          }
        }}
      >
        {children}
      </div>
      <dialog
        ref={dialog}
        className={s.entryModal}
        aria-label={title}
        // A click on the backdrop lands on the dialog itself; inside, on its content.
        onClick={(ev) => ev.target === dialog.current && dialog.current.close()}
      >
        {shown && (
          <div className={s.entryModalBody}>
            <div className={s.entryModalHead}>
              <div className={s.entryModalTitle}>{title}</div>
              <button type="button" className={s.entryModalClose} onClick={() => dialog.current?.close()} aria-label="Close">
                ×
              </button>
            </div>
            <dl className={s.entryFacts}>
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <table className={s.entryLines}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {e.books_lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.books_accounts?.code} {l.books_accounts?.name}
                      {l.memo ? <span className={s.muted}> · {l.memo}</span> : null}
                    </td>
                    <td>{formatPence(l.debit_pence, { blankZero: true })}</td>
                    <td>{formatPence(l.credit_pence, { blankZero: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={s.entryModalFoot}>
              <span className={s.muted}>#{e.id}</span>
              {e.receipt_id != null && (
                <Link className={s.link} href={`/account/books/receipts/${e.receipt_id}`}>
                  View receipt
                </Link>
              )}
              {canVoid && (
                <form
                  action={voidEntryAction}
                  onSubmit={(ev) => {
                    if (!window.confirm('Void this entry? It will be removed from your books.')) ev.preventDefault();
                  }}
                >
                  <input type="hidden" name="entry_id" value={e.id} />
                  <button className={s.voidBtn} type="submit">
                    Void entry
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
