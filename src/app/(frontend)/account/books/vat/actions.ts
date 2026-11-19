'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import type { Json } from '@/lib/database.types';
import { requireBooksWriter } from '@/lib/books/server';
import { preRegCandidates } from '@/lib/books/vatReturn';
import { preRegEntry, purchasesWithAccount } from '@/lib/books/vat.server';

/**
 * The one-off pre-registration VAT reclaim (Tally 3.6): for the ticked
 * eligible purchases, one journal on the registration date moves their VAT
 * out of the cost accounts into 2202, coded PREREG so it lands in box 4 of
 * the first return. external_id 'prereg' means it can only be done once.
 */
export async function postPreRegAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  const ledger = gate.ledger;
  if (!ledger) return { error: 'Set up your books first.' };
  if (!ledger.vat_registered || !ledger.vat_registration_date) {
    return { error: 'Tick VAT registered and set your registration date in Settings first.' };
  }
  if (await preRegEntry(ledger.id)) return { error: 'The pre-registration reclaim has already been posted.' };
  const reg = ledger.vat_registration_date;
  const ids = new Set(fd.getAll('entry_id').map(Number).filter(Number.isSafeInteger));
  if (!ids.size) return { error: 'Tick the purchases to reclaim.' };

  const fourYears = `${Number(reg.slice(0, 4)) - 4}${reg.slice(4)}`;
  const candidates = preRegCandidates(await purchasesWithAccount(ledger.id, fourYears, reg), reg);
  const chosen = candidates.filter((c) => ids.has(c.id) && c.eligible && c.account_code);
  if (!chosen.length) return { error: 'None of the ticked purchases can be reclaimed.' };

  const byAccount = new Map<string, number>();
  for (const c of chosen) byAccount.set(c.account_code, (byAccount.get(c.account_code) ?? 0) + c.vat_pence);
  const total = chosen.reduce((t, c) => t + c.vat_pence, 0);
  const lines = [
    { code: '2202', debit: total, credit: 0, memo: 'Pre-registration VAT reclaim' },
    ...[...byAccount].map(([code, vat]) => ({ code, debit: 0, credit: vat, memo: 'VAT reclaimed' })),
  ];
  const { error } = await createServiceRoleClient().rpc('books_post_entry', {
    p_ledger_id: ledger.id,
    p_entry: {
      entry_date: reg,
      kind: 'journal',
      source: 'prereg',
      description: `Pre-registration VAT reclaim (${chosen.length} purchase${chosen.length === 1 ? '' : 's'})`,
      vat_code: 'PREREG',
      net_pence: 0,
      vat_pence: total,
      gross_pence: total,
      external_id: 'prereg',
      meta: { entry_ids: chosen.map((c) => c.id) },
    } as unknown as Json,
    p_lines: lines as unknown as Json,
  });
  if (error) {
    console.error('[books] prereg post failed', { ledger: ledger.id, error: error.message });
    return { error: 'That didn’t post. Please try again.' };
  }
  revalidatePath('/account/books', 'layout');
  redirect('/account/books/vat?prereg=1');
}
