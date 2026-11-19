import { createServiceRoleClient } from '@/lib/supabase/server';
import { accountingYear, addDays, todayUk } from './period';
import { allLines, trialBalance, type Ledger } from './server';
import { estimate, pointers, readProfile, type ExpenseLine, type TaxInput } from './taxPointers';
import { ratesFor, taxYearOf } from './taxRates';

/** Ticked-off pointers, keyed "<pointer>|<year start>". */
export function doneMap(raw: unknown): Record<string, true> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v === true)) as Record<string, true>;
}

/** Everything the tax pointers page shows for this year (offset 0) or last (−1). */
export async function taxView(ledger: Ledger, offset: 0 | -1) {
  const today = todayUk();
  const period = accountingYear(ledger.year_end, today, offset);
  const partYear = today < period.to;
  const asOf = partYear ? today : period.to;
  const { rates, exact } = ratesFor(taxYearOf(period.to));
  const profile = readProfile(ledger.tax_profile, ledger.business_type);
  const admin = createServiceRoleClient();

  const [tb, tbToEnd, tb12, lines, invoices, firstIncome, firstAny] = await Promise.all([
    trialBalance(ledger.id, period.from, period.to),
    trialBalance(ledger.id, null, period.to),
    trialBalance(ledger.id, addDays(asOf, -364), asOf),
    allLines(ledger.id, { from: period.from, to: period.to }),
    admin
      .from('books_invoices')
      .select('number, status, issue_date, due_date, gross_pence, paid_pence, paid_at')
      .eq('ledger_id', ledger.id)
      .in('status', ['issued', 'paid'])
      .limit(5000),
    admin
      .from('books_line_view')
      .select('entry_date')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'income')
      .gt('credit_pence', 0)
      .order('entry_date')
      .limit(1)
      .maybeSingle(),
    admin.from('books_entries').select('entry_date').eq('ledger_id', ledger.id).order('entry_date').limit(1).maybeSingle(),
  ]);

  const expenseLines: ExpenseLine[] = lines
    .filter((l) => l.account_type === 'expense' && (l.debit_pence ?? 0) > (l.credit_pence ?? 0))
    .map((l) => ({
      entry_id: l.entry_id!,
      date: l.entry_date!,
      code: l.account_code!,
      account: l.account_name ?? '',
      text: [l.counterparty, l.description, l.memo].filter(Boolean).join(' · '),
      amount: (l.debit_pence ?? 0) - (l.credit_pence ?? 0),
    }));

  const firstSale = firstIncome.data?.entry_date ?? null;
  let costsBeforeFirstSale = 0;
  if (firstSale && firstSale >= period.from && firstSale <= period.to) {
    const before = await allLines(ledger.id, { to: addDays(firstSale, -1) });
    costsBeforeFirstSale = before.filter((l) => l.account_type === 'expense').reduce((t, l) => t + (l.debit_pence ?? 0) - (l.credit_pence ?? 0), 0);
  }

  const dla = tbToEnd.find((r) => r.code === '2300');
  const inv = invoices.data ?? [];
  const sixMonthsAgo = addDays(today, -182);
  const input: TaxInput = {
    profile,
    rates,
    period,
    partYear,
    tb,
    expenseLines,
    directorLoan: dla ? dla.credit_pence - dla.debit_pence : null,
    overdue: inv
      .filter((i) => i.status === 'issued' && i.due_date && i.due_date < sixMonthsAgo && i.gross_pence > i.paid_pence)
      .map((i) => ({ number: i.number, due_date: i.due_date!, outstanding: i.gross_pence - i.paid_pence })),
    unpaidAtEnd: inv
      .filter((i) => i.issue_date <= period.to && (i.status === 'issued' || (i.paid_at && i.paid_at.slice(0, 10) > period.to)))
      .reduce((t, i) => t + (i.status === 'issued' ? i.gross_pence - i.paid_pence : i.gross_pence), 0),
    firstSale,
    firstEntry: firstAny.data?.entry_date ?? null,
    costsBeforeFirstSale,
    vatRegistered: ledger.vat_registered,
    farming: ledger.farming,
    turnover: tb12.filter((r) => r.type === 'income').reduce((t, r) => t + r.credit_pence - r.debit_pence, 0),
  };
  const est = estimate(input);
  return { period, partYear, rates, exact, profile, estimate: est, pointers: pointers(input, est), done: doneMap(ledger.tax_done) };
}
