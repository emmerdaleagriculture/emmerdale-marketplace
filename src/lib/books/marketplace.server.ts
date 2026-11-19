import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import type { Json } from '@/lib/database.types';
import { todayUk } from './period';
import { accountMap, getAccounts, ledgerForPosting, type Ledger } from './server';
import { bookedFrom, marketplacePostings, type MarketJob, type MarketPayout } from './marketplace';

/** Signed off (completed) or settled (paid): the work is done and the price agreed. */
const DONE = ['completed', 'paid'];

/** The day marketplace jobs start being booked: the setting, or the day the books were set up. */
export const marketplaceFrom = (l: Ledger) => l.marketplace_from ?? todayUk(new Date(l.created_at));

type JobRow = {
  id: string;
  postcode: string | null;
  service_verbatim: string | null;
  completed_by_contractor_at: string | null;
  contractor_invoice_at: string | null;
  awarded_at: string | null;
  service: { name: string } | null;
  quote: { contractor_quote: { contractor_price_pence: number } | null } | null;
};

/**
 * Bring the contractor's finished marketplace jobs and our payouts into their
 * books. Safe to run any time: everything is keyed, so nothing posts twice.
 */
export async function syncLedgerMarketplace(ledger: Ledger): Promise<{ posted: number }> {
  if (!ledger.marketplace_auto) return { posted: 0 };
  const admin = createServiceRoleClient();
  const [jobsRes, payoutsRes, entries, accounts] = await Promise.all([
    admin
      .from('job_submissions')
      .select(
        `id, postcode, service_verbatim, completed_by_contractor_at, contractor_invoice_at, awarded_at,
         service:services(name),
         quote:client_quotes!job_submissions_accepted_quote_fk(contractor_quote:contractor_quotes(contractor_price_pence))`,
      )
      .eq('awarded_contractor_id', ledger.contractor_id)
      .in('status', DONE)
      .limit(5000),
    admin.from('contractor_payouts').select('id, submission_id, amount_pence, paid_on').eq('contractor_id', ledger.contractor_id).limit(5000),
    fetchAll<{ external_id: string | null; gross_pence: number }>((a, b) =>
      admin.from('books_entries').select('external_id, gross_pence').eq('ledger_id', ledger.id).eq('source', 'marketplace').order('id').range(a, b),
    ),
    getAccounts(ledger.id),
  ]);
  if (jobsRes.error) throw new Error(jobsRes.error.message);
  if (payoutsRes.error) throw new Error(payoutsRes.error.message);

  const jobs: MarketJob[] = ((jobsRes.data ?? []) as unknown as JobRow[]).flatMap((j) => {
    const price = j.quote?.contractor_quote?.contractor_price_pence;
    if (!price) return [];
    const at = j.completed_by_contractor_at ?? j.contractor_invoice_at ?? j.awarded_at;
    return [{ id: j.id, date: at ? todayUk(new Date(at)) : todayUk(), price_pence: price, service: j.service?.name ?? j.service_verbatim ?? 'Job', postcode: j.postcode }];
  });
  const payouts = (payoutsRes.data ?? []) as MarketPayout[];
  const { booked, payouts: bookedPayouts } = bookedFrom(entries);
  const bank = accounts.some((a) => a.code === ledger.default_payment_account) ? ledger.default_payment_account : '1200';
  const postings = marketplacePostings(jobs, payouts, booked, bookedPayouts, ledgerForPosting(ledger), accountMap(accounts), bank, marketplaceFrom(ledger));

  let posted = 0;
  for (const p of postings) {
    const { error } = await admin.rpc('books_post_entry', {
      p_ledger_id: ledger.id,
      p_entry: p.entry as unknown as Json,
      p_lines: p.lines as unknown as Json,
    });
    if (error) console.error('[books] marketplace post failed', { ledger: ledger.id, ext: p.entry.external_id, error: error.message });
    else posted++;
  }
  return { posted };
}
