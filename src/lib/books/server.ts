import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { membershipOf } from '@/lib/membership';
import { isAdminEmail, nonContractorPath } from '@/lib/auth';
import { isAppRequest } from '@/lib/appMode.server';
import { booksAllowed, filingAllowed, askAllowed } from './access';
import { sharedLedgers, touchViewer } from './viewers.server';
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
 *
 * Someone the owner has shared their books with (an accountant: see
 * viewers.server.ts) sees that ledger read only, with `viewing` set. They
 * need not be a contractor at all. A person with more than one set of books
 * to look at picks between them (the books_view cookie, set by
 * /account/books/switch); without a choice a contractor sees their own.
 */
export type BooksAccess = {
  userId: string;
  businessName: string;
  canEdit: boolean;
  ledger: Ledger | null;
  app: boolean;
  /** Set when these are someone else's books, shared with this person. */
  viewing: { ownerName: string } | null;
  /** Whether the signed-in person is a contractor (has a dashboard to go back to). */
  isContractor: boolean;
  /** Year-end filing through TinyTax is open for these books (a company, released to this account). */
  filing: boolean;
  /** Ask (questions answered from the books, paid for in tokens) is open to this person: their own books, on Premium, released to them. */
  ask: boolean;
  /** Every set of books this person can open, when there's more than one. */
  choices: { id: string; name: string; current: boolean }[];
};

export const VIEW_COOKIE = 'books_view';
export const OWN_BOOKS = 'own';

async function resolve(opts: { own?: boolean } = {}): Promise<
  | { kind: 'anon' }
  | { kind: 'not-contractor'; userId: string; email: string | null }
  | { kind: 'not-released' }
  | ({ kind: 'ok' } & BooksAccess)
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: 'anon' };
  const [{ data: contractor }, { data: sub }, shared] = await Promise.all([
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
    // Writers only ever touch their own books, so actions skip the lookup.
    opts.own ? Promise.resolve([]) : sharedLedgers(user.id),
  ]);
  const { data: ledger } = contractor
    ? await createServiceRoleClient().from('books_ledgers').select('*').eq('contractor_id', user.id).maybeSingle()
    : { data: null };
  // Released account by account while it's trialled. Someone taken off the
  // list keeps read-only access to books they already have (their records).
  const released = contractor ? await booksAllowed(user.email) : false;
  const hasOwn = Boolean(contractor && (released || ledger));

  const picked = shared.length ? (await cookies()).get(VIEW_COOKIE)?.value : undefined;
  // A pick of someone's books wins; otherwise your own, or the first shared set if you have none.
  const view = shared.find((s) => s.ledger.id === picked) ?? (hasOwn ? undefined : shared[0]);
  const app = await isAppRequest();
  const choices =
    shared.length + (hasOwn ? 1 : 0) > 1
      ? [
          ...(hasOwn ? [{ id: OWN_BOOKS, name: 'Your books', current: !view }] : []),
          ...shared.map((s) => ({ id: s.ledger.id, name: s.ownerName, current: view?.ledger.id === s.ledger.id })),
        ]
      : [];

  if (view) {
    void touchViewer(user.id, view.ledger.id).catch(() => {});
    return {
      kind: 'ok',
      userId: user.id,
      businessName: view.ownerName,
      canEdit: false,
      ledger: view.ledger,
      app,
      viewing: { ownerName: view.ownerName },
      isContractor: Boolean(contractor),
      filing: false,
      ask: false,
      choices,
    };
  }
  if (!contractor) return { kind: 'not-contractor', userId: user.id, email: user.email ?? null };
  if (!hasOwn) return { kind: 'not-released' };
  const canEdit = released && contractor.status === 'approved' && membershipOf(sub, contractor) === 'open';
  return {
    kind: 'ok',
    userId: user.id,
    businessName: contractor.business_name,
    canEdit,
    ledger: ledger ?? null,
    app,
    viewing: null,
    isContractor: true,
    filing: Boolean(ledger && ledger.business_type === 'limited_company' && (await filingAllowed(user.email))),
    ask: canEdit && (await askAllowed(user.email)),
    choices,
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
  if (r.kind === 'not-released') redirect('/account');
  const { kind: _kind, ...access } = r;
  return access;
}

/** For pages under /account/books/* that need a ledger: no ledger → the Books home. */
export async function loadLedger(next: string): Promise<BooksAccess & { ledger: Ledger }> {
  const access = await loadBooks(next);
  if (!access.ledger) redirect('/account/books');
  return access as BooksAccess & { ledger: Ledger };
}

/** For server actions that change the books. */
export async function requireBooksWriter(): Promise<{ ok: true; userId: string; ledger: Ledger | null } | { ok: false; error: string }> {
  const r = await resolve({ own: true });
  if (r.kind === 'not-released') return { ok: false, error: 'Books isn’t available on your account yet.' };
  if (r.kind !== 'ok') return { ok: false, error: 'You are not signed in as a contractor.' };
  if (!r.canEdit) {
    return { ok: false, error: r.ledger ? 'Your books are read-only while you’re not on Premium.' : 'Books is part of Premium membership.' };
  }
  return { ok: true, userId: r.userId, ledger: r.ledger };
}

/** For Ask: the signed-in contractor, on Premium, with Ask released to them. Always their own books. */
export async function requireAsker(): Promise<{ ok: true; userId: string; businessName: string; ledger: Ledger | null } | { ok: false; error: string }> {
  const r = await resolve({ own: true });
  if (r.kind !== 'ok' || !r.ask) return { ok: false, error: 'Ask isn’t available on your account.' };
  return { ok: true, userId: r.userId, businessName: r.businessName, ledger: r.ledger };
}

export function ledgerForPosting(l: Ledger): LedgerForPosting {
  return {
    vat_registered: l.vat_registered,
    vat_registration_date: l.vat_registration_date,
    vat_scheme: l.vat_scheme as LedgerForPosting['vat_scheme'],
    base_currency: l.base_currency,
    business_type: l.business_type as BusinessType,
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

/**
 * Entries a person may void: hand-entered ones, mileage claims, receipts'
 * entries and rows imported from a bank statement (the row shows as not
 * imported again). Marketplace entries aren't: the sync would book them again.
 */
export const VOIDABLE_SOURCES = ['manual', 'mileage', 'receipt', 'bank'] as const;

/**
 * Void an entry: it is removed from the books. If it came from a receipt,
 * the receipt goes back to review to be corrected and posted again.
 */
export async function voidEntry(ledgerId: string, entryId: number): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data: gone, error } = await admin
    .from('books_entries')
    .delete()
    .eq('id', entryId)
    .eq('ledger_id', ledgerId)
    .in('source', [...VOIDABLE_SOURCES])
    .select('receipt_id');
  if (error) {
    console.error('[books] void failed', { ledgerId, entryId, error: error.message });
    return false;
  }
  const receiptId = gone?.[0]?.receipt_id;
  if (receiptId) {
    await admin
      .from('books_receipts')
      .update({ status: 'needs_review', entry_id: null, review_reasons: 'Entry voided. Correct the details and post again.' })
      .eq('id', receiptId)
      .eq('ledger_id', ledgerId);
  }
  return Boolean(gone?.length);
}
