'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import type { Json } from '@/lib/database.types';
import { businessTypeOf, getAccounts, requireBooksWriter } from '@/lib/books/server';
import type { AccountType } from '@/lib/books/chart';
import { readSheet } from '@/lib/books/importFile';
import { codeForNew, openingLines, parseTrialBalance, suggestTargets, type ImportedAccount } from '@/lib/books/importTb';
import { customerKey, parseContacts } from '@/lib/books/importContacts';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ACCOUNTS = 500;
const TYPES: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];
const SOURCES = { xero: 'Xero', freshbooks: 'FreshBooks', other: 'another app' } as const;
type Source = keyof typeof SOURCES;

export type TbRow = ImportedAccount & { target: string };
export type TbPreviewState = FormState & {
  preview?: { source: Source; file: string; asAt: string | null; rows: TbRow[]; debits: number; credits: number; earlier: number };
};

const sourceOf = (v: FormDataEntryValue | null): Source => (v === 'xero' || v === 'freshbooks' ? v : 'other');

async function readUpload(fd: FormData): Promise<{ rows: string[][]; name: string } | { error: string }> {
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the file you exported.' };
  if (file.size > MAX_BYTES) return { error: 'That file is over 4MB.' };
  if (/\.pdf$/i.test(file.name)) return { error: 'PDFs can’t be read. Export the report as Excel or CSV instead.' };
  const sheet = readSheet(new Uint8Array(await file.arrayBuffer()));
  if ('error' in sheet) return sheet;
  return { rows: sheet, name: file.name.slice(0, 200) || 'import' };
}

/** Step 1: read a trial balance and suggest where each account goes. Nothing is saved. */
export async function readTrialBalanceAction(_prev: TbPreviewState, fd: FormData): Promise<TbPreviewState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const up = await readUpload(fd);
  if ('error' in up) return { error: up.error };
  const tb = parseTrialBalance(up.rows);
  if ('error' in tb) return { error: tb.error };
  if (tb.accounts.length > MAX_ACCOUNTS) return { error: `That has ${tb.accounts.length} accounts; the most we take at once is ${MAX_ACCOUNTS}.` };
  const accounts = await getAccounts(gate.ledger.id);
  const targets = suggestTargets(tb.accounts, accounts, businessTypeOf(gate.ledger));
  let earlier = 0;
  if (tb.asAt) {
    const { count } = await createServiceRoleClient()
      .from('books_entries')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', gate.ledger.id)
      .lte('entry_date', tb.asAt);
    earlier = count ?? 0;
  }
  return {
    preview: {
      source: sourceOf(fd.get('source')),
      file: up.name,
      asAt: tb.asAt,
      rows: tb.accounts.map((a, i) => ({ ...a, target: targets[i] })),
      debits: tb.debits,
      credits: tb.credits,
      earlier,
    },
  };
}

/** Step 2: make any new accounts and post the opening balances as one journal. */
export async function postOpeningBalancesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const ledger = gate.ledger;
  const date = String(fd.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Choose the date the balances are at.' };
  const source = sourceOf(fd.get('source'));
  const file = String(fd.get('file') ?? '').slice(0, 200);
  let rows: TbRow[];
  try {
    rows = JSON.parse(String(fd.get('rows') ?? '[]'));
  } catch {
    return { error: 'Something went wrong reading the matches. Please upload the file again.' };
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ACCOUNTS) return { error: 'There’s nothing to import.' };

  const accounts = await getAccounts(ledger.id);
  const existing = new Set(accounts.map((a) => a.code));
  const taken = new Set(existing);
  const fresh: { code: string; name: string; type: AccountType; is_fixed_asset: boolean; description: string }[] = [];
  const lines: { balance: number; code: string }[] = [];
  for (const r of rows) {
    if (!Number.isSafeInteger(r?.balance) || typeof r.name !== 'string' || typeof r.target !== 'string') return { error: 'Something went wrong reading the matches. Please upload the file again.' };
    let code = r.target;
    if (code.startsWith('new:')) {
      const type = code.slice(4) as AccountType;
      if (!TYPES.includes(type)) return { error: `Choose an account for “${r.name}”.` };
      const made = codeForNew(type, { code: r.code, fixed: Boolean(r.fixed), bank: Boolean(r.bank) }, taken);
      if (!made) return { error: `There’s no free account code left for “${r.name}”.` };
      taken.add(made);
      fresh.push({
        code: made,
        name: r.name.trim().slice(0, 120) || 'Imported account',
        type,
        is_fixed_asset: type === 'asset' && Boolean(r.fixed) && !r.bank,
        description: `Brought over from ${SOURCES[source]}${r.code ? ` (their code ${String(r.code).slice(0, 12)})` : ''}`,
      });
      code = made;
    } else if (!existing.has(code)) return { error: `Choose an account for “${r.name}”.` };
    lines.push({ balance: r.balance, code });
  }
  const sum = lines.reduce((s, l) => s + l.balance, 0);
  if (sum !== 0) return { error: 'Those balances don’t add up to zero, so they can’t be posted. Export the full trial balance and try again.' };
  const entryLines = openingLines(lines);
  if (entryLines.length < 2) return { error: 'Everything nets to nothing once matched, so there’s nothing to post.' };

  const admin = createServiceRoleClient();
  const externalId = `import:opening:${date}`;
  const { data: already } = await admin.from('books_entries').select('id').eq('ledger_id', ledger.id).eq('external_id', externalId).maybeSingle();
  if (already) return { error: 'Opening balances at that date are already in your books. Void that journal first if you want to bring them in again.' };

  if (fresh.length) {
    const { error } = await admin.from('books_accounts').insert(fresh.map((a) => ({ ledger_id: ledger.id, ...a })));
    if (error) {
      console.error('[books] import accounts failed', { ledger: ledger.id, error: error.message });
      return { error: 'The new accounts couldn’t be made. Please try again.' };
    }
  }
  const total = entryLines.reduce((s, l) => s + l.debit, 0);
  const { error } = await admin.rpc('books_post_entry', {
    p_ledger_id: ledger.id,
    p_entry: {
      entry_date: date,
      kind: 'journal',
      source: 'manual',
      description: `Opening balances brought over from ${SOURCES[source]}`,
      reference: file || null,
      vat_code: 'OUTSIDE',
      net_pence: total,
      gross_pence: total,
      external_id: externalId,
      meta: { import: source, file, accounts: rows.length },
    } as unknown as Json,
    p_lines: entryLines.map((l) => ({ ...l, memo: 'Opening balance' })) as unknown as Json,
  });
  if (error) {
    console.error('[books] opening balances post failed', { ledger: ledger.id, error: error.message });
    // Don't leave the empty accounts behind.
    if (fresh.length) await admin.from('books_accounts').delete().eq('ledger_id', ledger.id).in('code', fresh.map((a) => a.code));
    return { error: 'The balances couldn’t be posted. Please try again.' };
  }
  revalidatePath('/account/books', 'layout');
  redirect(`/account/books/ledger?imported=${fresh.length}`);
}

/** Customers from a contacts / clients export. Ones already in the books (same name) are left alone. */
export async function importCustomersAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const up = await readUpload(fd);
  if ('error' in up) return { error: up.error };
  const parsed = parseContacts(up.rows);
  if ('error' in parsed) return { error: parsed.error };
  const source = sourceOf(fd.get('source'));

  const admin = createServiceRoleClient();
  const { data: have, error: readErr } = await admin.from('books_customers').select('name').eq('ledger_id', gate.ledger.id).limit(10_000);
  if (readErr) return { error: 'That didn’t work. Please try again.' };
  const seen = new Set((have ?? []).map((c) => customerKey(c.name)));
  const add = parsed.customers.filter((c) => {
    const k = customerKey(c.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (let i = 0; i < add.length; i += 500) {
    const { error } = await admin.from('books_customers').insert(
      add.slice(i, i + 500).map((c) => ({ ledger_id: gate.ledger!.id, ...c, external_id: `import:${source}:${customerKey(c.name)}`.slice(0, 200) })),
    );
    if (error) {
      console.error('[books] customer import failed', { ledger: gate.ledger.id, error: error.message });
      return { error: i ? `${i} customers were added, then it stopped. Upload the file again to add the rest.` : 'That didn’t save. Please try again.' };
    }
  }
  revalidatePath('/account/books', 'layout');
  const already = parsed.customers.length - add.length;
  const bits = [`${add.length} customer${add.length === 1 ? '' : 's'} added`];
  if (already) bits.push(`${already} already in your books`);
  if (parsed.skipped) bits.push(`${parsed.skipped} supplier${parsed.skipped === 1 ? '' : 's'} or blank row${parsed.skipped === 1 ? '' : 's'} left out`);
  return { ok: true, message: `${bits.join(', ')}.` };
}
