'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { parsePounds } from '@/lib/books/money';
import { requireBooksWriter } from '@/lib/books/server';
import { readProfile, TAX_STRUCTURES, type TaxStructure } from '@/lib/books/taxPointers';
import { doneMap } from '@/lib/books/taxPointers.server';
import type { Json } from '@/lib/database.types';

/** How they're taxed: drives which pointers show and the estimate. */
export async function saveTaxProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const structure = String(fd.get('structure') ?? '');
  if (!(structure in TAX_STRUCTURES)) return { error: 'Choose how you’re taxed.' };
  const otherRaw = String(fd.get('other_income') ?? '').trim();
  const other = otherRaw ? parsePounds(otherRaw) : 0;
  if (other === null || other < 0) return { error: 'Other income should be an amount in pounds, like 12,000.' };
  const share = Number(fd.get('profit_share') || 100);
  if (!Number.isInteger(share) || share < 1 || share > 100) return { error: 'Your profit share should be a whole number from 1 to 100.' };
  const associated = Number(fd.get('associated') || 0);
  if (!Number.isInteger(associated) || associated < 0 || associated > 50) return { error: 'Associated companies should be a number from 0 to 50.' };
  const profile = readProfile(
    { structure: structure as TaxStructure, otherIncome: other, profitShare: share, scottish: fd.get('scottish') === 'on', associated },
    gate.ledger.business_type,
  );
  const { error } = await createServiceRoleClient()
    .from('books_ledgers')
    .update({ tax_profile: profile as unknown as Json })
    .eq('id', gate.ledger.id);
  if (error) return { error: 'That didn’t save. Please try again.' };
  revalidatePath('/account/books/tax');
  return { ok: true, message: 'Saved. The pointers below are updated.' };
}

/** Tick a pointer off for a year, or untick it. */
export async function toggleTaxDoneAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  const key = String(fd.get('key') ?? '');
  if (!/^[a-z0-9-]{1,40}\|\d{4}-\d{2}-\d{2}$/.test(key)) return;
  const done = doneMap(gate.ledger.tax_done);
  if (fd.get('done') === '1') done[key] = true;
  else delete done[key];
  await createServiceRoleClient()
    .from('books_ledgers')
    .update({ tax_done: done as unknown as Json })
    .eq('id', gate.ledger.id);
  revalidatePath('/account/books/tax');
}
