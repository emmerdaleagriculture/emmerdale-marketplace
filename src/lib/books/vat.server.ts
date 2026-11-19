import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import type { VatEntry } from './vatReturn';

const COLS = 'id, entry_date, kind, vat_code, net_pence, vat_pence, gross_pence, is_capital, counterparty, description';

/** Every entry in a date range, oldest first (paged past the 1000-row cap). */
export async function vatEntries(ledgerId: string, from: string, to: string): Promise<VatEntry[]> {
  const admin = createServiceRoleClient();
  return fetchAll<VatEntry>((a, b) =>
    admin
      .from('books_entries')
      .select(COLS)
      .eq('ledger_id', ledgerId)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date')
      .order('id')
      .range(a, b),
  );
}

type PurchaseRow = VatEntry & { books_lines: { debit_pence: number; books_accounts: { code: string } | null }[] };

/** Purchases with VAT in a range, each with the account it was categorised to. */
export async function purchasesWithAccount(ledgerId: string, from: string, to: string) {
  const admin = createServiceRoleClient();
  const rows = await fetchAll<PurchaseRow>((a, b) =>
    admin
      .from('books_entries')
      .select(`${COLS}, books_lines(debit_pence, books_accounts(code))`)
      .eq('ledger_id', ledgerId)
      .eq('kind', 'purchase')
      .gt('vat_pence', 0)
      .gte('entry_date', from)
      .lt('entry_date', to)
      .order('entry_date')
      .order('id')
      .range(a, b) as unknown as PromiseLike<{ data: PurchaseRow[] | null; error: { message: string } | null }>,
  );
  return rows.map(({ books_lines, ...e }) => ({
    ...e,
    account_code: books_lines.find((l) => l.debit_pence > 0 && l.books_accounts?.code !== '2202')?.books_accounts?.code ?? '',
  }));
}

/** Receipts not yet posted that may belong in the period (or have no date yet). */
export async function unpostedReceiptCount(ledgerId: string, from: string, to: string): Promise<number> {
  const { count } = await createServiceRoleClient()
    .from('books_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('ledger_id', ledgerId)
    .in('status', ['processing', 'needs_review'])
    .or(`doc_date.is.null,and(doc_date.gte.${from},doc_date.lte.${to})`);
  return count ?? 0;
}

export async function preRegEntry(ledgerId: string) {
  const { data } = await createServiceRoleClient()
    .from('books_entries')
    .select('id, entry_date, vat_pence')
    .eq('ledger_id', ledgerId)
    .eq('external_id', 'prereg')
    .maybeSingle();
  return data;
}
