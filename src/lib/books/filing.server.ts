/**
 * Year-end filing through TinyTax: a limited company's accounts to Companies
 * House and CT600 to HMRC, from Books › Year end. Released account by account
 * (app_config tinytax_allowlist). The company's own TinyTax key, Government
 * Gateway login and Companies House authentication code are kept sealed in
 * books_ledgers.filing_secrets (secrets.ts) and only ever unsealed here, on the
 * server, to go straight to TinyTax.
 *
 * Flow: figures from the books (yearEnd.ts) → owner edits → dry run of both
 * filings (nothing sent on) → owner files each → TinyTax answers 202 and we
 * poll GET /filings/{id} when the page is viewed (TinyTax has no webhooks;
 * most finish in 2–5 minutes) → on acceptance the documents are copied into
 * storage so they stay with the books.
 */

import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/database.types';
import { RECEIPTS_BUCKET } from './receipts.server';
import { trialBalance, type Ledger } from './server';
import { accountingYear, addDays, todayUk } from './period';
import { readProfile } from './taxPointers';
import { seal, secretsConfigured, unseal } from './secrets';
import { filingAllowed } from './access';

export { filingAllowed };
import {
  describeError,
  DOCUMENT_TYPES,
  isTestKey,
  tinytax,
  type AccountsRequest,
  type Ct600Request,
  type DocumentType,
  type DryRun,
  type FilingStatus,
  type TinyTaxResult,
} from './tinytax';
import { DIRECTORS_LOAN, figuresFromBooks, problems, readFigures, toFinancials, type YearEndFigures } from './yearEnd';

export type Filing = Database['public']['Tables']['books_filings']['Row'];
export type FilingKind = 'ct600' | 'accounts';

/* ------------------------------------------------------------------ access */

/** Year-end filing is for limited companies on the allowlist. */
export async function filingAvailable(ledger: Ledger | null, email: string | null | undefined): Promise<boolean> {
  return Boolean(ledger && ledger.business_type === 'limited_company' && (await filingAllowed(email)));
}

/* ----------------------------------------------------------------- secrets */

export type FilingSecrets = {
  apiKey?: string;
  gatewayId?: string;
  gatewayPassword?: string;
  authCode?: string;
};

export function readSecrets(ledger: Pick<Ledger, 'id' | 'filing_secrets'>): FilingSecrets {
  if (!ledger.filing_secrets || !secretsConfigured()) return {};
  const plain = unseal(ledger.filing_secrets, ledger.id);
  if (!plain) return {};
  try {
    const o = JSON.parse(plain) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    return { apiKey: str(o.apiKey), gatewayId: str(o.gatewayId), gatewayPassword: str(o.gatewayPassword), authCode: str(o.authCode) };
  } catch {
    return {};
  }
}

/** Merge changes in (undefined = keep, null = remove) and seal the lot again. */
export async function saveSecrets(ledger: Pick<Ledger, 'id' | 'filing_secrets'>, changes: { [K in keyof FilingSecrets]?: string | null }): Promise<boolean> {
  const next: FilingSecrets = { ...readSecrets(ledger) };
  for (const [k, v] of Object.entries(changes) as [keyof FilingSecrets, string | null | undefined][]) {
    if (v === null) delete next[k];
    else if (v !== undefined) next[k] = v;
  }
  const empty = !Object.values(next).some(Boolean);
  const { error } = await createServiceRoleClient()
    .from('books_ledgers')
    .update({ filing_secrets: empty ? null : seal(JSON.stringify(next), ledger.id) })
    .eq('id', ledger.id);
  if (error) console.error('[books/filing] save secrets failed', { ledgerId: ledger.id, error: error.message });
  return !error;
}

/** What the page may show about the secrets: whether each is there, never the values. */
export function secretsSummary(s: FilingSecrets) {
  return {
    apiKey: s.apiKey ? `${s.apiKey.split('_').slice(0, 3).join('_')}_…${s.apiKey.slice(-4)}` : null,
    test: s.apiKey ? isTestKey(s.apiKey) : false,
    gatewayId: s.gatewayId ? `…${s.gatewayId.slice(-3)}` : null,
    gatewayPassword: Boolean(s.gatewayPassword),
    authCode: Boolean(s.authCode),
  };
}
export type SecretsSummary = ReturnType<typeof secretsSummary>;

/* ----------------------------------------------------------------- periods */

/**
 * Where the books' own history starts: the latest opening-balances journal
 * (Books › Import's import:opening:<date>, or a migration's emm-open:<date>).
 * Years ending on or before it were summed up into that journal, so their
 * profit and loss isn't in the books and they can't be filed from here.
 */
export async function booksStart(ledgerId: string): Promise<string | null> {
  const { data } = await createServiceRoleClient()
    .from('books_entries')
    .select('entry_date')
    .eq('ledger_id', ledgerId)
    .or('external_id.like.import:opening:%,external_id.like.emm-open:%')
    .order('entry_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.entry_date ?? null;
}

export type FilingYear = { from: string; to: string; ended: boolean; beforeBooks: boolean };

/** This accounting year and the two before it, newest first. */
export async function filingYears(ledger: Ledger): Promise<FilingYear[]> {
  const today = todayUk();
  const start = await booksStart(ledger.id);
  return [0, -1, -2].map((o) => {
    const y = accountingYear(ledger.year_end, today, o);
    return { ...y, ended: y.to < today, beforeBooks: Boolean(start && y.to <= start) };
  });
}

/* ----------------------------------------------------------------- figures */

export type YearEndView = {
  figures: YearEndFigures;
  fromBooks: YearEndFigures;
  edited: boolean;
  dlaOverdrawn: boolean;
  lastCheck: LastCheck | null;
};

export type CheckResult = { ok: true; result: DryRun } | { ok: false; error: string; fields: string[] };
export type LastCheck = { at: string; hash: string; ct600: CheckResult; accounts: CheckResult };

export function figuresHash(f: YearEndFigures): string {
  return createHash('sha256').update(JSON.stringify(f)).digest('hex').slice(0, 16);
}

export async function yearEndView(ledger: Ledger, period: { from: string; to: string }, directorName: string): Promise<YearEndView> {
  const lastYear = { from: accountingYear(ledger.year_end, addDays(period.from, -1)).from, to: addDays(period.from, -1) };
  const [year, atEnd, atStart, priorYear, saved] = await Promise.all([
    trialBalance(ledger.id, period.from, period.to),
    trialBalance(ledger.id, null, period.to),
    trialBalance(ledger.id, null, addDays(period.from, -1)),
    trialBalance(ledger.id, lastYear.from, lastYear.to),
    createServiceRoleClient().from('books_year_ends').select('figures, last_check').eq('ledger_id', ledger.id).eq('period_end', period.to).maybeSingle(),
  ]);
  const profile = readProfile(ledger.tax_profile, ledger.business_type);
  const fromBooks = figuresFromBooks(year, atEnd, atStart, { declarantName: directorName, associatedCompanies: profile.associated, priorYear });
  const savedFigures = readFigures(saved.data?.figures);
  const dla = atEnd.find((r) => r.code === DIRECTORS_LOAN);
  return {
    figures: savedFigures ?? fromBooks,
    fromBooks,
    edited: Boolean(savedFigures),
    dlaOverdrawn: Boolean(dla && dla.debit_pence - dla.credit_pence > 0),
    lastCheck: (saved.data?.last_check as unknown as LastCheck | null) ?? null,
  };
}

export async function saveFigures(ledgerId: string, period: { from: string; to: string }, figures: YearEndFigures, lastCheck: LastCheck | null) {
  const { error } = await createServiceRoleClient()
    .from('books_year_ends')
    .upsert({
      ledger_id: ledgerId,
      period_end: period.to,
      period_start: period.from,
      figures: figures as unknown as Json,
      last_check: lastCheck as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

export async function resetFigures(ledgerId: string, periodEnd: string) {
  await createServiceRoleClient().from('books_year_ends').delete().eq('ledger_id', ledgerId).eq('period_end', periodEnd);
}

/* ---------------------------------------------------------------- requests */

type Ready = { ok: true; apiKey: string; company: string; utr: string; s: Required<FilingSecrets> } | { ok: false; missing: string[] };

/** Everything a filing needs that isn't a figure. */
export function readiness(ledger: Ledger): Ready {
  const s = readSecrets(ledger);
  const missing = [
    !ledger.company_number && 'company number',
    !ledger.utr && 'Corporation Tax UTR',
    !s.apiKey && 'TinyTax API key',
    !s.gatewayId && 'Government Gateway user ID',
    !s.gatewayPassword && 'Government Gateway password',
    !s.authCode && 'Companies House authentication code',
  ].filter(Boolean) as string[];
  if (missing.length) return { ok: false, missing };
  return { ok: true, apiKey: s.apiKey!, company: ledger.company_number!, utr: ledger.utr!, s: s as Required<FilingSecrets> };
}

function ct600Body(r: Extract<Ready, { ok: true }>, period: { from: string; to: string }, f: YearEndFigures, dryRun: boolean): Ct600Request {
  return {
    company_number: r.company,
    utr: r.utr,
    period_end: period.to,
    period: { start: period.from },
    declarant: { name: f.declarantName.trim(), status: 'Director' },
    credentials: { government_gateway_id: r.s.gatewayId, government_gateway_password: r.s.gatewayPassword },
    associated_companies: f.associatedCompanies,
    first_year: f.firstYear,
    dry_run: dryRun,
    financials: toFinancials(f, { forCt600: true }),
  };
}

function accountsBody(r: Extract<Ready, { ok: true }>, period: { from: string; to: string }, f: YearEndFigures, dryRun: boolean): AccountsRequest {
  return {
    company_number: r.company,
    period_end: period.to,
    period: { start: period.from },
    credentials: { company_auth_code: r.s.authCode },
    first_year: f.firstYear,
    dry_run: dryRun,
    financials: toFinancials(f, { forCt600: false }),
  };
}

/** The request as kept in books_filings: no credentials. */
function redact<T extends { credentials: unknown }>(body: T): Omit<T, 'credentials'> {
  const { credentials: _c, ...rest } = body;
  return rest;
}

function asCheck(r: TinyTaxResult<DryRun>): CheckResult {
  if (r.ok) return { ok: true, result: r.data };
  return { ok: false, error: describeError(r.error), fields: (r.error.details ?? []).map((d) => d.field ?? '').filter(Boolean) };
}

/** Dry runs of both filings: TinyTax validates and calculates, nothing goes to HMRC or Companies House. */
export async function checkBoth(ledger: Ledger, period: { from: string; to: string }, f: YearEndFigures): Promise<LastCheck | { error: string }> {
  const r = readiness(ledger);
  if (!r.ok) return { error: `Add your ${r.missing.join(', ')} in Settings first.` };
  const api = tinytax(r.apiKey);
  const [ct, acc] = await Promise.all([api.ct600(ct600Body(r, period, f, true)), api.accounts(accountsBody(r, period, f, true))]);
  return { at: new Date().toISOString(), hash: figuresHash(f), ct600: asCheck(ct), accounts: asCheck(acc) };
}

/**
 * File one of them for real. Refuses unless the figures are the ones last
 * checked and that check passed. The row is written before the call so its id
 * is the Idempotency-Key: a retry after a timeout can't file twice.
 */
export async function submitFiling(
  ledger: Ledger,
  period: { from: string; to: string },
  kind: FilingKind,
  userId: string,
): Promise<{ ok: true; filing: Filing } | { ok: false; error: string }> {
  const r = readiness(ledger);
  if (!r.ok) return { ok: false, error: `Add your ${r.missing.join(', ')} in Settings first.` };
  const view = await createServiceRoleClient().from('books_year_ends').select('figures, last_check').eq('ledger_id', ledger.id).eq('period_end', period.to).maybeSingle();
  const f = readFigures(view.data?.figures);
  const check = view.data?.last_check as unknown as LastCheck | null;
  if (!f || !check) return { ok: false, error: 'Check the figures with TinyTax first.' };
  if (check.hash !== figuresHash(f)) return { ok: false, error: 'The figures have changed since they were checked. Check them again first.' };
  if (!check[kind].ok) return { ok: false, error: 'TinyTax’s check didn’t pass. Fix what it says and check again.' };
  const today = todayUk();
  if (period.to >= today) return { ok: false, error: 'You can file once the year has ended.' };
  const blockers = problems(f, { periodEnd: period.to, today, dlaOverdrawn: false });
  if (blockers.length) return { ok: false, error: blockers[0] };

  const body = kind === 'ct600' ? ct600Body(r, period, f, false) : accountsBody(r, period, f, false);
  const admin = createServiceRoleClient();
  const { data: row, error } = await admin
    .from('books_filings')
    .insert({
      ledger_id: ledger.id,
      kind,
      period_start: period.from,
      period_end: period.to,
      sandbox: isTestKey(r.apiKey),
      request: redact(body) as unknown as Json,
      submitted_by: userId,
    })
    .select('*')
    .single();
  if (error || !row) {
    if (error?.code === '23505') return { ok: false, error: 'This has already been filed (or is on its way) for this year.' };
    return { ok: false, error: 'That didn’t start. Please try again.' };
  }

  const api = tinytax(r.apiKey);
  const res = kind === 'ct600' ? await api.ct600(body as Ct600Request, row.idempotency_key) : await api.accounts(body as AccountsRequest, row.idempotency_key);
  const patch: Database['public']['Tables']['books_filings']['Update'] = { updated_at: new Date().toISOString() };
  if (res.ok) {
    patch.tinytax_filing_id = res.data.filing_id;
    patch.status = normaliseStatus(res.data.status);
    patch.response = res.data as unknown as Json;
    patch.next_poll_at = new Date(Date.now() + (res.retryAfter ?? 30) * 1000).toISOString();
  } else if (res.status === 0 || res.status >= 500) {
    // We don't know whether it got there. Keep it live; the Idempotency-Key makes a retry safe.
    patch.status = 'sending';
    patch.error = describeError(res.error);
  } else {
    patch.status = 'failed';
    patch.error = describeError(res.error);
    patch.response = { error: res.error, request_id: res.requestId } as unknown as Json;
  }
  const { data: updated } = await admin.from('books_filings').update(patch).eq('id', row.id).select('*').single();
  const filing = updated ?? { ...row, ...patch } as Filing;
  if (filing.status === 'failed') return { ok: false, error: `TinyTax refused it: ${filing.error}` };
  return { ok: true, filing };
}

function normaliseStatus(s: string | undefined): Filing['status'] {
  return s === 'accepted' || s === 'rejected' || s === 'error' || s === 'submitted' || s === 'pending' ? s : 'submitted';
}

/** Retry a submission whose answer never came back (network or TinyTax 5xx). Same Idempotency-Key. */
export async function retrySending(ledger: Ledger, filing: Filing): Promise<Filing> {
  if (filing.status !== 'sending') return filing;
  const r = readiness(ledger);
  if (!r.ok) return filing;
  const f = await createServiceRoleClient().from('books_year_ends').select('figures').eq('ledger_id', ledger.id).eq('period_end', filing.period_end).maybeSingle();
  const figures = readFigures(f.data?.figures);
  if (!figures) return filing;
  const period = { from: filing.period_start, to: filing.period_end };
  const api = tinytax(r.apiKey);
  // Re-send exactly what was recorded, so the Idempotency-Key matches the same body.
  const body = { ...(filing.request as Record<string, unknown>), credentials: filing.kind === 'ct600' ? ct600Body(r, period, figures, false).credentials : accountsBody(r, period, figures, false).credentials };
  const res = filing.kind === 'ct600' ? await api.ct600(body as Ct600Request, filing.idempotency_key) : await api.accounts(body as AccountsRequest, filing.idempotency_key);
  if (!res.ok && (res.status === 0 || res.status >= 500)) return filing;
  const patch: Database['public']['Tables']['books_filings']['Update'] = res.ok
    ? { tinytax_filing_id: res.data.filing_id, status: normaliseStatus(res.data.status), response: res.data as unknown as Json, error: null, next_poll_at: new Date(Date.now() + 30_000).toISOString() }
    : { status: 'failed', error: describeError(res.error) };
  const { data } = await createServiceRoleClient().from('books_filings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', filing.id).select('*').single();
  return data ?? filing;
}

/* ----------------------------------------------------------------- polling */

const LIVE = ['pending', 'submitted'];

export async function listFilings(ledgerId: string): Promise<Filing[]> {
  const { data } = await createServiceRoleClient()
    .from('books_filings')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Ask TinyTax about filings still on their way (when due, or `force`). On acceptance, keep the documents. */
export async function pollFilings(ledger: Ledger, filings: Filing[], opts: { force?: boolean } = {}): Promise<Filing[]> {
  const apiKey = readSecrets(ledger).apiKey;
  if (!apiKey) return filings;
  const now = Date.now();
  return Promise.all(
    filings.map(async (fl) => {
      if (fl.status === 'sending' && (opts.force || !fl.next_poll_at || Date.parse(fl.next_poll_at) <= now)) return retrySending(ledger, fl);
      const due = LIVE.includes(fl.status) && fl.tinytax_filing_id && (opts.force || !fl.next_poll_at || Date.parse(fl.next_poll_at) <= now);
      // TinyTax's sandbox is stateless: it keeps no documents to fetch.
      const needsDocs = !fl.sandbox && fl.status === 'accepted' && fl.tinytax_filing_id && !(Array.isArray(fl.documents) && fl.documents.length);
      if (!due && !needsDocs) return fl;
      return pollOne(ledger, apiKey, fl);
    }),
  );
}

async function pollOne(ledger: Ledger, apiKey: string, fl: Filing): Promise<Filing> {
  const api = tinytax(apiKey);
  const admin = createServiceRoleClient();
  const patch: Database['public']['Tables']['books_filings']['Update'] = { updated_at: new Date().toISOString() };
  if (fl.status !== 'accepted') {
    const res = await api.filing(fl.tinytax_filing_id!);
    if (!res.ok) {
      patch.next_poll_at = new Date(Date.now() + 60_000).toISOString();
      const { data } = await admin.from('books_filings').update(patch).eq('id', fl.id).select('*').single();
      return data ?? fl;
    }
    const st: FilingStatus = res.data;
    patch.status = normaliseStatus(st.status);
    patch.last_status = st as unknown as Json;
    // The spec says `error: { code, message }`; the API (sandbox, 2026-11-23) sends error_code / error_message.
    const code = st.error?.code ?? st.error_code;
    const message = st.error?.message ?? st.error_message;
    if (code || message) patch.error = [code, message].filter(Boolean).join(': ');
    // Their advice: every 30s for 5 minutes, then every 5 minutes; Retry-After wins when longer.
    const age = Date.now() - Date.parse(fl.created_at);
    const wait = Math.max(res.retryAfter ?? 0, age < 5 * 60_000 ? 30 : 300);
    patch.next_poll_at = LIVE.includes(patch.status) ? new Date(Date.now() + wait * 1000).toISOString() : null;
  }
  if (!fl.sandbox && (patch.status ?? fl.status) === 'accepted') patch.documents = (await keepDocuments(ledger.id, api, fl)) as unknown as Json;
  const { data } = await admin.from('books_filings').update(patch).eq('id', fl.id).select('*').single();
  return data ?? { ...fl, ...patch } as Filing;
}

export type StoredDocument = { type: DocumentType; path: string; size: number; contentType: string };

const STORE_AS: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'application/xml': 'text/plain',
  'text/xml': 'text/plain',
  'application/xhtml+xml': 'text/html',
  'text/html': 'text/html',
};

/** Copy the filed documents into storage (the receipts bucket, under filings/). */
async function keepDocuments(ledgerId: string, api: ReturnType<typeof tinytax>, fl: Filing): Promise<StoredDocument[]> {
  const list = await api.documents(fl.tinytax_filing_id!);
  if (!list.ok) return [];
  const admin = createServiceRoleClient();
  const out: StoredDocument[] = [];
  for (const d of list.data.documents) {
    if (!DOCUMENT_TYPES.includes(d.type)) continue;
    const file = await api.document(fl.tinytax_filing_id!, d.type);
    if (!file) continue;
    const ct = file.contentType.split(';')[0].trim().toLowerCase();
    const path = `${ledgerId}/filings/${fl.id}/${d.type}`;
    const { error } = await admin.storage.from(RECEIPTS_BUCKET).upload(path, file.bytes, { contentType: STORE_AS[ct] ?? 'text/plain', upsert: true });
    if (error) {
      console.error('[books/filing] keep document failed', { filing: fl.id, type: d.type, error: error.message });
      continue;
    }
    out.push({ type: d.type, path, size: file.bytes.length, contentType: ct });
  }
  return out;
}

export function storedDocuments(fl: Pick<Filing, 'documents'>): StoredDocument[] {
  return Array.isArray(fl.documents) ? (fl.documents as unknown as StoredDocument[]) : [];
}
