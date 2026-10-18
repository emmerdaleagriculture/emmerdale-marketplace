import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The numbers on the app's tab bar (src/components/app/tabs.ts).
 *
 *   invites   contractor: invitations they have not opened yet, on jobs
 *             still taking prices
 *   prices    customer: prices in that they have not looked at yet
 *   messages  either side: the other side's messages not yet read, leaving
 *             out anything a moderator is still holding (the reader cannot
 *             see those, so they must not be counted)
 *
 * Service role: job_messages has no policies of its own (lib/sealedQuotes/
 * messages.ts), and the counts need joins across both sides' tables.
 */
export type Badges = { invites: number; prices: number; messages: number };

/** Jobs still open to pricing, as sq_thread_state and the views define it. */
const LIVE = ['distributed', 'quotes_receiving', 'accepted_awaiting_payment'];

export async function getBadges(userId: string): Promise<Badges> {
  const admin = createServiceRoleClient();
  const out: Badges = { invites: 0, prices: 0, messages: 0 };

  const [contractor, customer] = await Promise.all([
    admin.from('contractors').select('id').eq('id', userId).maybeSingle(),
    admin.from('customers').select('id').eq('id', userId).maybeSingle(),
  ]);

  const counts: PromiseLike<unknown>[] = [];

  if (contractor.data) {
    counts.push(
      admin
        .from('job_invitations')
        .select('id, job_submissions!inner(status)', { count: 'exact', head: true })
        .eq('contractor_id', userId)
        .eq('status', 'sent')
        .in('job_submissions.status', LIVE)
        .then(({ count }) => {
          out.invites += count ?? 0;
        }),
      admin
        .from('job_messages')
        .select('id, job_invitations!inner(contractor_id)', { count: 'exact', head: true })
        .eq('job_invitations.contractor_id', userId)
        .eq('sender', 'client')
        .is('read_at', null)
        .or('moderation.is.null,moderation.eq.approved')
        .then(({ count }) => {
          out.messages += count ?? 0;
        }),
    );
  }

  if (customer.data) {
    counts.push(
      admin
        .from('client_quotes')
        .select('id, job_submissions!inner(customer_id, status)', { count: 'exact', head: true })
        .eq('job_submissions.customer_id', userId)
        .in('job_submissions.status', LIVE)
        .eq('status', 'active')
        .is('viewed_at', null)
        .then(({ count }) => {
          out.prices += count ?? 0;
        }),
      admin
        .from('job_messages')
        .select('id, job_submissions!inner(customer_id)', { count: 'exact', head: true })
        .eq('job_submissions.customer_id', userId)
        .eq('sender', 'contractor')
        .is('read_at', null)
        .or('moderation.is.null,moderation.eq.approved')
        .then(({ count }) => {
          out.messages += count ?? 0;
        }),
    );
  }

  await Promise.all(counts);
  return out;
}
