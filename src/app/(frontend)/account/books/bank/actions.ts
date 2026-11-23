'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import type { Json } from '@/lib/database.types';
import { getAccounts, requireBooksWriter } from '@/lib/books/server';
import { parseStatement } from '@/lib/books/bankCsv';
import { POTS_CODE } from '@/lib/books/bank';
import { autoImport, loadStatement, rebookRows, statementAccounts } from '@/lib/books/bank.server';
import { isVatCode } from '@/lib/books/vat';

const MAX_BYTES = 4 * 1024 * 1024;

/** UTF-8 if it is valid UTF-8, otherwise Windows-1252 (older bank exports). */
function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Upload a CSV: read it, keep it with its rows, and book every row not already in the books. */
export async function uploadStatementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the statement file.' };
  if (file.size > MAX_BYTES) return { error: 'That file is over 4MB. Download a shorter period.' };
  const name = file.name.slice(0, 200) || 'statement.csv';
  if (/\.(pdf|xlsx?|ofx|qif)$/i.test(name)) return { error: 'Choose a CSV file. Most banks offer CSV under “Export” or “Download transactions”.' };
  const code = String(fd.get('account_code') ?? '');
  const accounts = await getAccounts(gate.ledger.id);
  if (!statementAccounts(accounts).some((a) => a.code === code)) return { error: 'Choose which account the statement is for.' };

  const parsed = parseStatement(decode(await file.arrayBuffer()), { flip: fd.get('flip') === 'on' });
  if ('error' in parsed) return { error: parsed.error };

  const admin = createServiceRoleClient();
  // Monzo pots need somewhere to go.
  if (parsed.rows.some((r) => /pot transfer/i.test(r.type ?? '')) && !accounts.some((a) => a.code === POTS_CODE)) {
    await admin
      .from('books_accounts')
      .insert({ ledger_id: gate.ledger.id, code: POTS_CODE, name: 'Savings pots', type: 'asset', description: 'Money moved into Monzo (or other) savings pots' });
  }
  const { data, error } = await admin
    .from('books_bank_statements')
    .insert({
      ledger_id: gate.ledger.id,
      account_code: code,
      file_name: name,
      start_date: parsed.start,
      end_date: parsed.end,
      row_count: parsed.rows.length,
      opening_balance_pence: parsed.opening,
      closing_balance_pence: parsed.closing,
      rows: parsed.rows as unknown as Json,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[books] statement save failed', { ledger: gate.ledger.id, error: error?.message });
    return { error: 'That didn’t save. Please try again.' };
  }
  const st = await loadStatement(gate.ledger.id, data.id);
  const r = st ? await autoImport(gate.ledger, st) : { posted: 0, failed: [] };
  if (r.failed.length) console.error('[books] auto import left rows', { ledger: gate.ledger.id, statement: data.id, failed: r.failed.slice(0, 5) });
  revalidatePath('/account/books', 'layout');
  const q = new URLSearchParams({ imported: String(r.posted) });
  if (parsed.skipped) q.set('skipped', String(parsed.skipped));
  redirect(`/account/books/bank/${data.id}?${q}`);
}

/** Book the rows of a statement uploaded before importing was automatic. */
export async function autoImportAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  const id = Number(fd.get('statement_id'));
  const st = await loadStatement(gate.ledger.id, id);
  if (!st) return;
  const r = await autoImport(gate.ledger, st);
  revalidatePath('/account/books', 'layout');
  redirect(`/account/books/bank/${id}?imported=${r.posted}`);
}

/** Save changed rows (and book any not in the books yet): picks is JSON [{row, account, vat}]. */
export async function importRowsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const id = Number(fd.get('statement_id'));
  const st = await loadStatement(gate.ledger.id, id);
  if (!st) return { error: 'That statement has gone.' };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get('picks') ?? '[]'));
  } catch {
    return { error: 'Please try again.' };
  }
  if (!Array.isArray(raw)) return { error: 'Please try again.' };
  const picks = raw
    .filter((p): p is { row: number; account: string; vat: string } => p && Number.isInteger(p.row) && typeof p.account === 'string' && isVatCode(p.vat))
    .slice(0, 5000)
    .map((p) => ({ row: p.row, choice: { account: p.account, vat: p.vat as never } }));
  if (!picks.length) return { error: 'Nothing has changed.' };
  const r = await rebookRows(gate.ledger, st, picks);
  revalidatePath('/account/books', 'layout');
  if (r.failed.length) {
    const first = r.failed[0];
    return {
      error: `${r.posted ? `Saved ${r.posted}. ` : ''}${r.failed.length} row${r.failed.length === 1 ? '' : 's'} didn’t save — row ${first.row + 1}: ${first.error}`,
    };
  }
  redirect(`/account/books/bank/${id}?saved=${r.posted}`);
}

/** Remove an uploaded statement. Entries it booked stay in the books. */
export async function deleteStatementAction(fd: FormData): Promise<void> {
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return;
  await createServiceRoleClient().from('books_bank_statements').delete().eq('ledger_id', gate.ledger.id).eq('id', Number(fd.get('statement_id')));
  revalidatePath('/account/books', 'layout');
  redirect('/account/books/bank');
}
