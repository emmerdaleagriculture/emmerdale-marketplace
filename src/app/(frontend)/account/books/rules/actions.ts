'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { getAccounts, requireBooksWriter } from '@/lib/books/server';
import { isVatCode } from '@/lib/books/vat';

export async function addRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const match = String(fd.get('match_text') ?? '').trim().slice(0, 100);
  if (match.length < 2) return { error: 'Type the payee or supplier name (at least 2 letters).' };
  const direction = String(fd.get('direction') ?? 'any');
  const account = String(fd.get('account_code') ?? '') || null;
  const paidFrom = String(fd.get('paid_from') ?? '') || null;
  const vat = String(fd.get('vat_code') ?? '') || null;
  if (!account && !paidFrom) return { error: 'Choose where it goes, or what pays it.' };
  const codes = new Set((await getAccounts(gate.ledger.id)).map((a) => a.code));
  if ((account && !codes.has(account)) || (paidFrom && !codes.has(paidFrom))) return { error: 'Choose an account from the list.' };
  if (vat && !isVatCode(vat)) return { error: 'Choose a VAT rate from the list.' };
  const { error } = await createServiceRoleClient()
    .from('books_rules')
    .insert({
      ledger_id: gate.ledger.id,
      match_text: match,
      direction: ['in', 'out'].includes(direction) ? direction : 'any',
      account_code: account,
      vat_code: vat,
      paid_from: paidFrom,
    });
  if (error) {
    console.error('[books] rule save failed', { ledger: gate.ledger.id, error: error.message });
    return { error: 'That didn’t save. Please try again.' };
  }
  revalidatePath('/account/books', 'layout');
  return { ok: true, message: `Saved. From now on “${match}” follows this rule.` };
}

export async function deleteRuleAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  await createServiceRoleClient().from('books_rules').delete().eq('ledger_id', gate.ledger.id).eq('id', Number(fd.get('rule_id')));
  revalidatePath('/account/books', 'layout');
}
