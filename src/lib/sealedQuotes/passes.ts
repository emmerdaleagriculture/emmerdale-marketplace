import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Prices a customer has passed on (20261002170000_price_passes). A pass
 * belongs to one client_quotes row; a revised price is a new row, so it
 * arrives clean and is marked as new against the earlier pass.
 */

export { PASS_REASONS } from './passReasons';

export type QuotePass = { clientQuoteId: string; contractorId: string; reason: string; createdAt: string };

/** Live passes on a job, plus every pass ever made (for "new since you passed"). */
export async function getQuotePasses(submissionId: string): Promise<{ live: QuotePass[]; all: QuotePass[] }> {
  const { data } = await createServiceRoleClient()
    .from('client_quote_passes')
    .select('client_quote_id, contractor_id, reason, created_at, undone_at')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true })
    .limit(200);
  const all = (data ?? []).map((p) => ({
    clientQuoteId: p.client_quote_id,
    contractorId: p.contractor_id,
    reason: p.reason,
    createdAt: p.created_at,
    undone: p.undone_at != null,
  }));
  return { live: all.filter((p) => !p.undone), all };
}

/**
 * The pass on a contractor's current price for a job, if the customer has
 * passed on it and the contractor hasn't sent a new one since. Null otherwise.
 */
export async function getPassOnCurrentPrice(submissionId: string, contractorId: string): Promise<{ reason: string; createdAt: string } | null> {
  const admin = createServiceRoleClient();
  const { data: current } = await admin
    .from('client_quotes')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('contractor_id', contractorId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!current) return null;
  const { data: pass } = await admin
    .from('client_quote_passes')
    .select('reason, created_at')
    .eq('client_quote_id', current.id)
    .is('undone_at', null)
    .maybeSingle();
  return pass ? { reason: pass.reason, createdAt: pass.created_at } : null;
}
