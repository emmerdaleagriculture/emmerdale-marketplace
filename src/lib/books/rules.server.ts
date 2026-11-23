import { createServiceRoleClient } from '@/lib/supabase/server';
import { isVatCode } from './vat';
import type { Rule } from './rules';

export async function loadRules(ledgerId: string): Promise<Rule[]> {
  const { data, error } = await createServiceRoleClient()
    .from('books_rules')
    .select('id, match_text, direction, account_code, vat_code, paid_from')
    .eq('ledger_id', ledgerId)
    .order('match_text')
    .limit(1000);
  // Before the table exists (migration not yet applied) there are simply no rules.
  if (error) return [];
  return (data ?? []).map((r) => ({
    ...r,
    direction: (['in', 'out'].includes(r.direction) ? r.direction : 'any') as Rule['direction'],
    vat_code: r.vat_code && isVatCode(r.vat_code) ? r.vat_code : null,
  }));
}
