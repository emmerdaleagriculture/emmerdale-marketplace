import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import type { Json } from '@/lib/database.types';
import { addDays } from './period';
import { isVatCode, registeredOn, type VatCode } from './vat';
import { accountMap, allLines, getAccounts, ledgerForPosting, type BooksAccount, type Ledger } from './server';
import { classify, reconcile, rowExternalId, rowPosting, suggest, MATCH_DAYS, type BookLine, type Choice, type OpenInvoice, type PayeeHistory } from './bank';
import { payeeKey, type BankRow } from './bankCsv';
import { loadInvoice, recordPayment } from './invoices.server';

export type Statement = {
  id: number;
  account_code: string;
  file_name: string;
  start_date: string;
  end_date: string;
  row_count: number;
  opening_balance_pence: number | null;
  closing_balance_pence: number | null;
  created_at: string;
  rows: BankRow[];
};

export async function loadStatement(ledgerId: string, id: number): Promise<Statement | null> {
  const { data } = await createServiceRoleClient()
    .from('books_bank_statements')
    .select('*')
    .eq('ledger_id', ledgerId)
    .eq('id', id)
    .maybeSingle();
  return data ? ({ ...data, rows: data.rows as unknown as BankRow[] } as Statement) : null;
}

/** Lines on one account from a few days before to a few days after a range: + in, − out. */
async function bookLines(ledgerId: string, code: string, start: string, end: string): Promise<BookLine[]> {
  const rows = await allLines(ledgerId, { code, from: addDays(start, -MATCH_DAYS), to: addDays(end, MATCH_DAYS) });
  return rows.map((l) => ({
    entry_id: l.entry_id,
    date: l.entry_date,
    amount: l.debit_pence - l.credit_pence,
    external_id: l.external_id,
    source: l.source,
    counterparty: l.counterparty,
    description: l.description,
  }));
}

/** The account and VAT code each payee's statement rows were booked to most recently. */
async function payeeHistory(ledgerId: string): Promise<PayeeHistory> {
  const admin = createServiceRoleClient();
  const entries = await fetchAll<{ id: number; vat_code: string; meta: Json; books_lines: { debit_pence: number; credit_pence: number; books_accounts: { code: string } | null }[] }>(
    (a, b) =>
      admin
        .from('books_entries')
        .select('id, vat_code, meta, books_lines(debit_pence, credit_pence, books_accounts(code))')
        .eq('ledger_id', ledgerId)
        .eq('source', 'bank')
        .order('entry_date')
        .order('id')
        .range(a, b) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>,
    { max: 20_000 },
  );
  const out: PayeeHistory = new Map();
  for (const e of entries) {
    const meta = (e.meta ?? {}) as { payee?: string; bank?: string };
    if (!meta.payee) continue;
    // The account that isn't the bank or VAT.
    const acc = e.books_lines.map((l) => l.books_accounts?.code).find((c) => c && c !== meta.bank && c !== '2201' && c !== '2202');
    if (acc && isVatCode(e.vat_code)) out.set(meta.payee, { account: acc, vat: e.vat_code as VatCode });
  }
  return out;
}

async function openInvoices(ledgerId: string): Promise<OpenInvoice[]> {
  const { data } = await createServiceRoleClient()
    .from('books_invoices')
    .select('id, number, issue_date, gross_pence, paid_pence, books_customers(name, organisation)')
    .eq('ledger_id', ledgerId)
    .eq('status', 'issued')
    .limit(1000);
  return (data ?? []).map((i) => {
    const c = i.books_customers as unknown as { name: string; organisation: string | null } | null;
    return { id: i.id, number: i.number, issue_date: i.issue_date, due_pence: i.gross_pence - i.paid_pence, customer: c?.organisation || c?.name || '' };
  });
}

/** Everything the statement page shows. */
export async function statementView(ledger: Ledger, st: Statement) {
  const [lines, accounts, history, invoices] = await Promise.all([
    bookLines(ledger.id, st.account_code, st.start_date, st.end_date),
    getAccounts(ledger.id),
    payeeHistory(ledger.id),
    openInvoices(ledger.id),
  ]);
  const { states, usedEntries } = classify(st.rows, st.account_code, lines);
  const suggestions = suggest(st.rows, states, {
    registered: (d) => registeredOn(ledgerForPosting(ledger), d),
    history,
    invoices,
    accounts: accountMap(accounts),
  });
  const rec = reconcile(st.rows, states, lines, usedEntries, { start: st.start_date, end: st.end_date });
  // The books' balance on the account before the statement's first day and after its last.
  const { data: opening } = await createServiceRoleClient().rpc('books_account_opening', {
    p_ledger_id: ledger.id,
    p_code: st.account_code,
    p_before: st.start_date,
  });
  const booksOpening = Number(opening ?? 0);
  const booksClosing = booksOpening + rec.booksIn - rec.booksOut;
  return { states, suggestions, rec, accounts, invoices, booksOpening, booksClosing };
}

export type ImportResult = { posted: number; failed: { row: number; error: string }[] };

/**
 * Book the chosen rows. Each row is checked again against the books first,
 * so a double submit or an overlapping statement books nothing twice.
 */
export async function importRows(ledger: Ledger, st: Statement, picks: { row: number; choice: Choice }[]): Promise<ImportResult> {
  const admin = createServiceRoleClient();
  const view = await statementView(ledger, st);
  const accounts = new Map(view.accounts.map((a: BooksAccount) => [a.code, { code: a.code, type: a.type, is_fixed_asset: a.is_fixed_asset, name: a.name }]));
  const lfp = ledgerForPosting(ledger);
  const result: ImportResult = { posted: 0, failed: [] };
  for (const { row: i, choice } of picks) {
    const row = st.rows[i];
    if (!row || view.states[i]?.status === 'imported') continue;
    if (choice.account.startsWith('inv:')) {
      const err = await payInvoice(ledger, st, row, Number(choice.account.slice(4)));
      if (err) result.failed.push({ row: i, error: err });
      else result.posted++;
      continue;
    }
    const p = rowPosting(row, choice, st.account_code, lfp, accounts, st.id);
    if ('error' in p) {
      result.failed.push({ row: i, error: p.error });
      continue;
    }
    p.entry.meta = { ...p.entry.meta, bank: st.account_code };
    const { error } = await admin.rpc('books_post_entry', {
      p_ledger_id: ledger.id,
      p_entry: p.entry as unknown as Json,
      p_lines: p.lines as unknown as Json,
    });
    if (error) {
      console.error('[books] bank row post failed', { ledger: ledger.id, statement: st.id, row: i, error: error.message });
      result.failed.push({ row: i, error: 'That row didn’t post.' });
    } else result.posted++;
  }
  return result;
}

async function payInvoice(ledger: Ledger, st: Statement, row: BankRow, invoiceId: number): Promise<string | null> {
  if (row.amount <= 0) return 'Only money in can pay an invoice.';
  const inv = await loadInvoice(ledger.id, invoiceId);
  if (!inv || inv.status !== 'issued') return 'That invoice isn’t waiting for payment.';
  const r = await recordPayment(ledger, inv, {
    paid_on: row.date,
    amount_pence: row.amount,
    method: 'bank',
    reference: row.payee.slice(0, 100),
    external_id: rowExternalId(st.account_code, row.key),
    into: st.account_code,
  });
  return r.ok ? null : r.error;
}

/** Bank and card accounts a statement can be for (not Stripe's balance). */
export const statementAccounts = (accounts: BooksAccount[]) =>
  accounts.filter((a) => a.code >= '1200' && a.code < '1300' && a.code !== '1220' && (a.type === 'asset' || a.type === 'liability'));

export { payeeKey };
