import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { membershipOf } from '@/lib/membership';
import { isAdminEmail, nonContractorPath } from '@/lib/auth';
import { isAppRequest } from '@/lib/appMode.server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import type { Database } from '@/lib/database.types';
import type { AccountType, BusinessType } from './chart';
import type { AccountInfo, LedgerForPosting } from './posting';

export type Ledger = Database['public']['Tables']['books_ledgers']['Row'];
export type BooksAccount = {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  is_fixed_asset: boolean;
  is_system: boolean;
};

/**
 * Who may use Books. Writing needs an approved contractor on Premium (internal
 * tier 'open'). A contractor whose membership has lapsed keeps read-only
 * access to books they already have — they are business records — and can
 * still download them. The tables are service-role only, so every page and
 * action goes through here.
 */
export type BooksAccess = {
  userId: string;
  businessName: string;
  canEdit: boolean;
  ledger: Ledger | null;
  app: boolean;
};

async function resolve(): Promise<
  { kind: 'anon' } | { kind: 'not-contractor'; userId: string; email: string | null } | ({ kind: 'ok' } & BooksAccess)
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: 'anon' };
  const [{ data: contractor }, { data: sub }] = await Promise.all([
    supabase
      .from('contractors')
      .select('id, business_name, status, premium_comped_until, open_comped_until')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('status, plan, tier, current_period_end')
      .eq('contractor_id', user.id)
      .maybeSingle(),
  ]);
  if (!contractor) return { kind: 'not-contractor', userId: user.id, email: user.email ?? null };
  const canEdit = contractor.status === 'approved' && membershipOf(sub, contractor) === 'open';
  const { data: ledger } = await createServiceRoleClient()
    .from('books_ledgers')
    .select('*')
    .eq('contractor_id', user.id)
    .maybeSingle();
  return {
    kind: 'ok',
    userId: user.id,
    businessName: contractor.business_name,
    canEdit,
    ledger: ledger ?? null,
    app: await isAppRequest(),
  };
}

/** For pages: signs in, bounces non-contractors, returns access (ledger may be null). */
export async function loadBooks(next: string): Promise<BooksAccess> {
  const r = await resolve();
  if (r.kind === 'anon') redirect(`/login?next=${encodeURIComponent(next)}`);
  if (r.kind === 'not-contractor') {
    if (isAdminEmail(r.email)) redirect('/admin');
    redirect(await nonContractorPath(r.userId));
  }
  return { userId: r.userId, businessName: r.businessName, canEdit: r.canEdit, ledger: r.ledger, app: r.app };
}

/** For pages under /account/books/* that need a ledger: no ledger → the Books home. */
export async function loadLedger(next: string): Promise<BooksAccess & { ledger: Ledger }> {
  const access = await loadBooks(next);
  if (!access.ledger) redirect('/account/books');
  return access as BooksAccess & { ledger: Ledger };
}

/** For server actions that change the books. */
export async function requireBooksWriter(): Promise<{ ok: true; userId: string; ledger: Ledger | null } | { ok: false; error: string }> {
  const r = await resolve();
  if (r.kind !== 'ok') return { ok: false, error: 'You are not signed in as a contractor.' };
  if (!r.canEdit) {
    return { ok: false, error: r.ledger ? 'Your books are read-only while you’re not on Premium.' : 'Books is part of Premium membership.' };
  }
  return { ok: true, userId: r.userId, ledger: r.ledger };
}

export function ledgerForPosting(l: Ledger): LedgerForPosting {
  return {
    vat_registered: l.vat_registered,
    vat_registration_date: l.vat_registration_date,
    vat_scheme: l.vat_scheme as LedgerForPosting['vat_scheme'],
    base_currency: l.base_currency,
  };
}

export function businessTypeOf(l: Ledger): BusinessType {
  return l.business_type as BusinessType;
}

export async function getAccounts(ledgerId: string): Promise<BooksAccount[]> {
  const { data, error } = await createServiceRoleClient()
    .from('books_accounts')
    .select('id, code, name, type, description, is_fixed_asset, is_system')
    .eq('ledger_id', ledgerId)
    .order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as BooksAccount[];
}

export function accountMap(accounts: BooksAccount[]): Map<string, AccountInfo> {
  return new Map(accounts.map((a) => [a.code, { code: a.code, type: a.type, is_fixed_asset: a.is_fixed_asset }]));
}

export type TbRow = Database['public']['Functions']['books_trial_balance']['Returns'][number];

export async function trialBalance(ledgerId: string, from?: string | null, to?: string | null): Promise<TbRow[]> {
  const { data, error } = await createServiceRoleClient().rpc('books_trial_balance', {
    p_ledger_id: ledgerId,
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type EntryWithLines = Database['public']['Tables']['books_entries']['Row'] & {
  books_lines: { debit_pence: number; credit_pence: number; memo: string | null; books_accounts: { code: string; name: string } | null }[];
};

export async function recentEntries(ledgerId: string, limit: number): Promise<EntryWithLines[]> {
  const { data, error } = await createServiceRoleClient()
    .from('books_entries')
    .select('*, books_lines(debit_pence, credit_pence, memo, books_accounts(code, name))')
    .eq('ledger_id', ledgerId)
    .order('entry_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(limit, 1000));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EntryWithLines[];
}

export type LineViewRow = Database['public']['Views']['books_line_view']['Row'];

/** Every line in the ledger (optionally one account, optionally a date range), oldest first. */
export async function allLines(ledgerId: string, opts: { code?: string; from?: string | null; to?: string | null } = {}) {
  const admin = createServiceRoleClient();
  return fetchAll<LineViewRow>(
    (from, to) => {
      let q = admin.from('books_line_view').select('*').eq('ledger_id', ledgerId);
      if (opts.code) q = q.eq('account_code', opts.code);
      if (opts.from) q = q.gte('entry_date', opts.from);
      if (opts.to) q = q.lte('entry_date', opts.to);
      return q.order('entry_date').order('entry_id').order('line_id').range(from, to);
    },
    { max: 200_000 },
  );
}
