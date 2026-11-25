import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { allLines, trialBalance, type Ledger } from './server';
import { todayUk } from './period';
import { isToolName, summariseLines, summariseTotals, TOOL_INPUTS } from './askTools';

/**
 * Runs one Ask tool for one contractor. `who` comes from the signed-in
 * session, never from the model, so a question can only ever read the
 * asker's own books and jobs. Everything here reads; nothing writes
 * (changes go through askActions.server.ts and the member's confirmation).
 */
export type AskWho = { contractorId: string; ledger: Ledger | null };

type InvoiceRow = { id: number; number: string; issue_date: string; due_date: string; gross_pence: number; paid_pence: number; customer: unknown };
type JobRow = {
  id: string;
  postcode: string | null;
  status: string;
  awarded_at: string | null;
  completed_by_contractor_at: string | null;
  service_verbatim: string | null;
  service: unknown;
  quote: unknown;
};

const pounds = (pence: number) => Math.round(pence) / 100;
const NO_BOOKS = { error: 'This business has not set up its books yet, so there are no accounts to read.' };
/** Dates are UK days; timestamps are compared from the start of `from` to the end of `to`. */
const startOf = (d: string) => `${d}T00:00:00+00:00`;
const endOf = (d: string) => `${d}T23:59:59.999+00:00`;

export async function runAskTool(name: string, input: unknown, who: AskWho): Promise<unknown> {
  if (!isToolName(name)) return { error: `There is no tool called ${name}.` };
  const parsed = TOOL_INPUTS[name].safeParse(input);
  if (!parsed.success) return { error: 'Those inputs are not valid. Dates must be YYYY-MM-DD or null.' };
  const admin = createServiceRoleClient();

  switch (name) {
    case 'account_totals': {
      if (!who.ledger) return NO_BOOKS;
      const { from, to } = parsed.data as { from: string | null; to: string | null };
      return { from, to, ...summariseTotals(await trialBalance(who.ledger.id, from, to)) };
    }

    case 'ledger_lines': {
      if (!who.ledger) return NO_BOOKS;
      const i = parsed.data as (typeof TOOL_INPUTS)['ledger_lines']['_output'];
      const rows = await allLines(who.ledger.id, { code: i.account_code ?? undefined, from: i.from, to: i.to });
      return { from: i.from, to: i.to, ...summariseLines(rows, { search: i.search, accountType: i.account_type, groupBy: i.group_by }) };
    }

    case 'invoices': {
      if (!who.ledger) return NO_BOOKS;
      const i = parsed.data as (typeof TOOL_INPUTS)['invoices']['_output'];
      const ledgerId = who.ledger.id;
      // Paged: one response stops at 1,000 rows, and the oldest invoices are the ones most likely still owed.
      const data = await fetchAll<InvoiceRow>((a, b) => {
        let q = admin
          .from('books_invoices')
          .select('id, number, issue_date, due_date, gross_pence, paid_pence, customer:books_customers(name, organisation)')
          .eq('ledger_id', ledgerId)
          .neq('status', 'draft')
          .neq('status', 'void');
        if (i.from) q = q.gte('issue_date', i.from);
        if (i.to) q = q.lte('issue_date', i.to);
        return q.order('issue_date', { ascending: false }).order('id', { ascending: false }).range(a, b) as unknown as PromiseLike<{ data: InvoiceRow[] | null; error: { message: string } | null }>;
      });
      const today = todayUk();
      const all = data.map((r) => {
        const c = r.customer as unknown as { name: string; organisation: string | null } | null;
        const owed = r.gross_pence - r.paid_pence;
        return {
          number: r.number,
          customer: c?.organisation || c?.name || null,
          issued: r.issue_date,
          due: r.due_date,
          amount: pounds(r.gross_pence),
          paid: pounds(r.paid_pence),
          owed: pounds(owed),
          overdue: owed > 0 && r.due_date < today,
        };
      });
      const shown = all.filter((r) => (i.show === 'all' ? true : i.show === 'paid' ? r.owed <= 0 : i.show === 'overdue' ? r.overdue : r.owed > 0));
      return {
        from: i.from,
        to: i.to,
        today,
        invoices_matched: shown.length,
        total_amount: pounds(shown.reduce((t, r) => t + Math.round(r.amount * 100), 0)),
        total_owed: pounds(shown.reduce((t, r) => t + Math.round(r.owed * 100), 0)),
        invoices: shown.slice(0, 60),
        invoices_not_shown: Math.max(0, shown.length - 60),
      };
    }

    case 'marketplace_jobs': {
      const { from, to } = parsed.data as { from: string | null; to: string | null };
      // Both paged: one response stops at 1,000 rows.
      const [data, payouts] = await Promise.all([
        fetchAll<JobRow>((a, b) => {
          let q = admin
            .from('job_submissions')
            .select(
              `id, postcode, status, awarded_at, completed_by_contractor_at, service_verbatim,
               service:services(name),
               quote:client_quotes!job_submissions_accepted_quote_fk(contractor_quote:contractor_quotes(contractor_price_pence))`,
            )
            .eq('awarded_contractor_id', who.contractorId);
          if (from) q = q.gte('awarded_at', startOf(from));
          if (to) q = q.lte('awarded_at', endOf(to));
          return q.order('awarded_at', { ascending: false }).order('id').range(a, b) as unknown as PromiseLike<{ data: JobRow[] | null; error: { message: string } | null }>;
        }),
        fetchAll<{ submission_id: string; amount_pence: number }>((a, b) =>
          admin.from('contractor_payouts').select('submission_id, amount_pence').eq('contractor_id', who.contractorId).order('id').range(a, b),
        ),
      ]);
      const paid = new Map<string, number>();
      for (const p of payouts) paid.set(p.submission_id, (paid.get(p.submission_id) ?? 0) + p.amount_pence);
      const jobs = data.map((j) => {
        const quote = j.quote as unknown as { contractor_quote: { contractor_price_pence: number } | null } | null;
        const price = quote?.contractor_quote?.contractor_price_pence ?? null;
        return {
          service: (j.service as unknown as { name: string } | null)?.name ?? j.service_verbatim ?? 'Job',
          area: j.postcode?.trim().split(/\s+/)[0]?.toUpperCase() ?? null,
          status: j.status,
          won_on: j.awarded_at ? todayUk(new Date(j.awarded_at)) : null,
          finished_on: j.completed_by_contractor_at ? todayUk(new Date(j.completed_by_contractor_at)) : null,
          your_price: price === null ? null : pounds(price),
          paid_to_you: pounds(paid.get(j.id) ?? 0),
        };
      });
      return {
        from,
        to,
        jobs_won: jobs.length,
        total_of_your_prices: pounds(jobs.reduce((t, j) => t + Math.round((j.your_price ?? 0) * 100), 0)),
        total_paid_to_you: pounds(jobs.reduce((t, j) => t + Math.round(j.paid_to_you * 100), 0)),
        jobs: jobs.slice(0, 60),
        jobs_not_shown: Math.max(0, jobs.length - 60),
      };
    }

    case 'marketplace_activity': {
      const { from, to } = parsed.data as { from: string | null; to: string | null };
      // Counted in the database: a plain select stops at 1,000 rows.
      const n = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
        const { count, error } = await q;
        if (error) throw new Error(error.message);
        return count ?? 0;
      };
      const invitations = () => {
        let q = admin.from('job_invitations').select('id', { count: 'exact', head: true }).eq('contractor_id', who.contractorId);
        if (from) q = q.gte('sent_at', startOf(from));
        if (to) q = q.lte('sent_at', endOf(to));
        return q;
      };
      let prices = admin.from('contractor_quotes').select('id', { count: 'exact', head: true }).eq('contractor_id', who.contractorId);
      if (from) prices = prices.gte('created_at', startOf(from));
      if (to) prices = prices.lte('created_at', endOf(to));
      let wins = admin.from('job_submissions').select('id', { count: 'exact', head: true }).eq('awarded_contractor_id', who.contractorId);
      if (from) wins = wins.gte('awarded_at', startOf(from));
      if (to) wins = wins.lte('awarded_at', endOf(to));
      const [invited, opened, passed, priced, won] = await Promise.all([
        n(invitations()),
        n(invitations().not('opened_at', 'is', null)),
        n(invitations().eq('status', 'declined')),
        n(prices),
        n(wins),
      ]);
      return { from, to, invitations_received: invited, invitations_opened: opened, invitations_passed_on: passed, prices_given: priced, jobs_won: won };
    }

    case 'customers': {
      if (!who.ledger) return NO_BOOKS;
      const ledgerId = who.ledger.id;
      const { search } = parsed.data as { search: string };
      const all = await fetchAll<{ id: number; name: string; organisation: string | null; email: string | null }>((a, b) =>
        admin.from('books_customers').select('id, name, organisation, email').eq('ledger_id', ledgerId).order('name').order('id').range(a, b),
      );
      const needle = search.trim().toLowerCase();
      const matched = needle ? all.filter((c) => [c.name, c.organisation, c.email].some((f) => f?.toLowerCase().includes(needle))) : all;
      return {
        customers_matched: matched.length,
        customers: matched.slice(0, 60).map((c) => ({ id: c.id, name: c.name, business: c.organisation, email: c.email })),
        customers_not_shown: Math.max(0, matched.length - 60),
      };
    }
  }
}
