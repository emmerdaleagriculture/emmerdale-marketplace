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
import { autoImportAction, deleteStatementAction } from '../actions';
import { ImportTable, type ImportRow } from './ImportTable';

export const metadata: Metadata = { title: 'Bank statement', robots: { index: false, follow: false } };

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string; saved?: string; skipped?: string }> }) {
  const { id } = await params;
  const { imported, saved, skipped } = await searchParams;
  const access = await loadLedger(`/account/books/bank/${id}`);
  const l = access.ledger;
  const st = await loadStatement(l.id, Number(id));
  if (!st) notFound();
  const v = await statementView(l, st);
  const acc = v.accounts.find((a) => a.code === st.account_code);
  const lfp = ledgerForPosting(l);

  const rows: ImportRow[] = st.rows.map((r, i) => {
    const state = v.states[i];
    const b = v.booked[i];
    return {
      date: r.date,
      payee: r.payee,
      description: r.description,
      amount: r.amount,
      status: v.waiting[i] ? 'waiting' : state.status,
      matchLabel: state.status === 'matched' ? state.label : undefined,
      booked: b ? { account: b.account, vat: b.vat, check: b.check, why: b.why, editable: b.own } : null,
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
  const notIn = rows.filter((x) => x.status === 'new').length;
  const waitingN = rows.filter((x) => x.status === 'waiting').length;
  const checkN = rows.filter((x) => x.booked?.check).length;
  const cardLike = acc?.type === 'liability';

  return (
    <BooksFrame access={access} title={`${st.account_code} ${acc?.name ?? ''}`} tab="bank" crumb="Bank statement">
      <p className={m.sub}>
        {ukDate(st.start_date)} – {ukDate(st.end_date)} · {st.row_count} rows · {st.file_name}
      </p>
      {imported && imported !== '0' && (
        <p className={s.notice}>
          Booked {imported} row{imported === '1' ? '' : 's'} into your books.
        </p>
      )}
      {saved && <p className={s.notice}>Saved.</p>}
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
              <th>{ukDate(v.from)} – {ukDate(st.end_date)}</th>
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
              ...(!cardLike && v.statementOpening != null ? [['Opening balance', v.statementOpening, v.booksOpening] as const] : []),
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
        {notIn === 0 ? 'Every statement row is in your books.' : `${notIn} statement row${notIn === 1 ? ' is' : 's are'} not in your books yet.`}{' '}
        {v.coveredRows > 0 &&
          v.openingAt &&
          `${v.coveredRows} row${v.coveredRows === 1 ? '' : 's'} up to ${ukDate(v.openingAt)} ${v.coveredRows === 1 ? 'is' : 'are'} already in your opening balances, so ${v.coveredRows === 1 ? 'it isn’t' : 'they aren’t'} booked again. `}
        {waitingN > 0 && `${waitingN} Stripe payout${waitingN === 1 ? '' : 's'} will be booked by your Stripe sync. `}
        {checkN > 0 && `${checkN} row${checkN === 1 ? ' was' : 's were'} new payees, filed by AI: worth a glance (highlighted below). `}
        {r.notOnStatement.length > 0 &&
          `${r.notOnStatement.length} entr${r.notOnStatement.length === 1 ? 'y' : 'ies'} on ${st.account_code} in these dates ${r.notOnStatement.length === 1 ? 'isn’t' : 'aren’t'} on the statement (below).`}
      </p>

      <h2 className={m.h2}>Rows</h2>
      {access.canEdit && rows.some((x) => x.status === 'new') && (
        <form action={autoImportAction} className={s.actions}>
          <input type="hidden" name="statement_id" value={st.id} />
          <span className={m.sub} style={{ margin: 0 }}>
            {rows.filter((x) => x.status === 'new').length} rows aren’t in your books yet.
          </span>
          <button type="submit" className={f.btnPrimary}>
            Book them now
          </button>
        </form>
      )}
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
            Entries on {st.account_code} from {ukDate(v.from)} to {ukDate(st.end_date)} with no matching statement row. A wrong amount, a wrong
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
