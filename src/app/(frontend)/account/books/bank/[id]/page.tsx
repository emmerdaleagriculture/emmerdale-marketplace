import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLedger, ledgerForPosting } from '@/lib/books/server';
import { loadStatement, statementView } from '@/lib/books/bank.server';
import { isPurchaseCategory } from '@/lib/books/chart';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import { registeredOn } from '@/lib/books/vat';
import f from '@/components/forms/forms.module.css';
import m from '../../../market/market.module.css';
import s from '../../books.module.css';
import { BooksFrame } from '../../BooksFrame';
import { deleteStatementAction } from '../actions';
import { ImportTable, type ImportRow } from './ImportTable';

export const metadata: Metadata = { title: 'Bank statement', robots: { index: false, follow: false } };

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string; skipped?: string }> }) {
  const { id } = await params;
  const { imported, skipped } = await searchParams;
  const access = await loadLedger(`/account/books/bank/${id}`);
  const l = access.ledger;
  const st = await loadStatement(l.id, Number(id));
  if (!st) notFound();
  const v = await statementView(l, st);
  const acc = v.accounts.find((a) => a.code === st.account_code);
  const lfp = ledgerForPosting(l);

  const rows: ImportRow[] = st.rows.map((r, i) => {
    const state = v.states[i];
    return {
      date: r.date,
      payee: r.payee,
      description: r.description,
      amount: r.amount,
      status: state.status,
      matchLabel: state.status === 'matched' ? state.label : undefined,
      registered: registeredOn(lfp, r.date),
      suggestion: v.suggestions[i],
    };
  });
  const options = v.accounts
    .filter((a) => a.code !== st.account_code)
    .map((a) => ({
      code: a.code,
      name: a.name,
      group: a.type === 'income' ? ('income' as const) : a.type === 'expense' ? ('expense' as const) : isPurchaseCategory(a) ? ('asset' as const) : ('other' as const),
    }));
  const r = v.rec;
  const cardLike = acc?.type === 'liability';

  return (
    <BooksFrame access={access} title={`${st.account_code} ${acc?.name ?? ''}`} tab="bank" crumb="Bank statement">
      <p className={m.sub}>
        {ukDate(st.start_date)} – {ukDate(st.end_date)} · {st.row_count} rows · {st.file_name}
      </p>
      {imported && <p className={s.notice}>Imported {imported} row{imported === '1' ? '' : 's'}.</p>}
      {skipped && (
        <p className={s.notice}>
          {skipped} line{skipped === '1' ? ' wasn’t a transaction' : 's weren’t transactions'} (headings, totals or blank amounts)
          and {skipped === '1' ? 'was' : 'were'} left out.
        </p>
      )}

      <h2 className={m.h2}>Statement against your books</h2>
      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th>{ukDate(st.start_date)} – {ukDate(st.end_date)}</th>
              <th className={m.num}>Statement</th>
              <th className={m.num}>Books</th>
              <th className={m.num}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Money in', r.statementIn, r.booksIn],
              ['Money out', r.statementOut, r.booksOut],
              ['Net movement', r.statementIn - r.statementOut, r.booksIn - r.booksOut],
              ...(!cardLike && st.opening_balance_pence != null ? [['Opening balance', st.opening_balance_pence, v.booksOpening] as const] : []),
              ...(!cardLike && st.closing_balance_pence != null ? [['Closing balance', st.closing_balance_pence, v.booksClosing] as const] : []),
            ].map(([label, a, b]) => (
              <tr key={label as string}>
                <td>{label}</td>
                <td className={m.num}>{formatPence(a as number)}</td>
                <td className={m.num}>{formatPence(b as number)}</td>
                <td className={m.num}>{(a as number) === (b as number) ? '✓' : formatPence((a as number) - (b as number))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={m.fine}>
        {r.notInBooks === 0 ? 'Every statement row is in your books.' : `${r.notInBooks} statement row${r.notInBooks === 1 ? ' is' : 's are'} not in your books yet.`}{' '}
        {r.notOnStatement.length > 0 &&
          `${r.notOnStatement.length} entr${r.notOnStatement.length === 1 ? 'y' : 'ies'} on ${st.account_code} in these dates ${r.notOnStatement.length === 1 ? 'isn’t' : 'aren’t'} on the statement (below).`}
      </p>

      <h2 className={m.h2}>Rows</h2>
      <ImportTable
        statementId={st.id}
        rows={rows}
        accounts={options}
        invoices={v.invoices.map(({ id, number, customer, due_pence }) => ({ id, number, customer, due_pence }))}
        canEdit={access.canEdit}
      />

      {r.notOnStatement.length > 0 && (
        <>
          <h2 className={m.h2}>In your books but not on the statement</h2>
          <p className={m.sub}>
            Entries on {st.account_code} in these dates with no matching statement row. A wrong amount, a wrong
            date, the wrong account, or something entered twice? Check the{' '}
            <Link className={s.link} href={`/account/books/accounts/${st.account_code}`}>
              account ledger
            </Link>
            , and void it from the <Link className={s.link} href="/account/books/journal">journal</Link> to post it again.
          </p>
          <div className={m.tableWrap}>
            <table className={m.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Who</th>
                  <th>Description</th>
                  <th className={m.num}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {r.notOnStatement.map((x) => (
                  <tr key={`${x.entry_id}-${x.amount}`}>
                    <td>{ukDate(x.date)}</td>
                    <td>{x.counterparty ?? ''}</td>
                    <td style={{ whiteSpace: 'normal' }}>{x.description ?? ''}</td>
                    <td className={m.num}>{formatPence(x.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {access.canEdit && (
        <form action={deleteStatementAction} style={{ marginTop: 24 }}>
          <input type="hidden" name="statement_id" value={st.id} />
          <button type="submit" className={f.btnGhost}>
            Remove this upload
          </button>
          <span className={s.muted}> Rows already imported stay in your books.</span>
        </form>
      )}
    </BooksFrame>
  );
}
