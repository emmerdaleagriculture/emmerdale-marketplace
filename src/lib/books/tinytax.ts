/**
 * TinyTax Filing API (https://tinytax.co.uk/developers, OpenAPI v2.19.0):
 * CT600 returns to HMRC and company accounts to Companies House. One key per
 * company (their own TinyTax subscription), sent as X-API-Key. A tt_test_ key
 * is TinyTax's sandbox: full validation, no HMRC or Companies House calls.
 *
 * No VAT here: TinyTax's MTD VAT is a web app you upload a CSV to (see
 * vat.csv?type=tinytax), not part of this API.
 *
 * Server only: callers pass credentials straight through from
 * filing.server.ts and nothing here logs a request body.
 */

export const TINYTAX_BASE = 'https://tinytax.co.uk/api/v1';

export type TinyTaxWarning = { code: string; message: string };
export type TinyTaxErrorDetail = { field?: string; code?: string; message?: string };
export type TinyTaxError = { code: string; message: string; details?: TinyTaxErrorDetail[] };

export type TinyTaxResult<T> =
  | { ok: true; status: number; data: T; requestId?: string; retryAfter?: number }
  | { ok: false; status: number; error: TinyTaxError; requestId?: string; retryAfter?: number };

/** Pounds, as TinyTax takes them. */
export type Financials = {
  profit_and_loss?: {
    turnover?: number;
    cost_of_sales?: number;
    staff_costs?: number;
    depreciation?: number;
    other_operating_expenses?: number;
    other_income?: number;
    tax_charge?: number;
  };
  tax_adjustments?: {
    depreciation_addback?: number;
    capital_allowances?: number;
    disallowable_expenses?: number;
    other_additions?: number;
    other_deductions?: number;
  };
  losses?: { brought_forward?: number };
  balance_sheet: {
    fixed_assets: number;
    current_assets: number;
    creditors_within_one_year: number;
    creditors_after_one_year?: number;
    share_capital?: number;
    profit_and_loss_account: number;
    provisions?: number;
    accruals_and_deferred_income?: number;
  };
  average_employees?: number;
  nil_disclosures_confirmed: boolean;
  director_loan?: {
    participator_name: string;
    balance_brought_forward?: number;
    amount_lent: number;
    amount_repaid_in_period?: number;
    amount_repaid_total?: number;
    amount_repaid?: number;
    repaid_date?: string;
    interest_rate?: number | null;
    close_company?: boolean;
  } | null;
};

export type Ct600Request = {
  company_number: string;
  utr: string;
  period_end: string;
  period?: { start?: string | null };
  declarant?: { name?: string; status?: 'Director' | 'Company Secretary' | 'Agent' };
  credentials: { government_gateway_id: string; government_gateway_password: string };
  dry_run?: boolean;
  associated_companies?: number;
  financials?: Financials;
};

export type AccountsRequest = {
  company_number: string;
  period_end: string;
  period?: { start?: string | null };
  credentials: { company_auth_code: string };
  dry_run?: boolean;
  financials?: Financials;
};

export type Calculated = {
  taxable_profit?: number;
  corporation_tax?: number;
  marginal_relief?: number;
  effective_rate?: number;
  losses_used?: number;
  losses_carried_forward?: number;
  loans_to_participators_tax?: number;
  accounts_type?: string;
  is_split_period?: boolean;
};

export type DerivedValues = { company_name?: string; period_start?: string; is_first_year?: boolean; declarant_name?: string };

export type DryRun = {
  dry_run: boolean;
  validation?: string;
  company_number?: string;
  period_end?: string;
  filing_type?: string;
  accounts_type?: string;
  derived_values?: DerivedValues;
  calculated?: Calculated;
  warnings?: TinyTaxWarning[];
};

export type Submitted = {
  filing_id: string;
  status: string;
  filing_type?: string;
  accounts_type?: string;
  hmrc_correlation_id?: string;
  ch_submission_number?: string;
  submitted_at?: string;
  derived_values?: DerivedValues;
  calculated?: Calculated;
  warnings?: TinyTaxWarning[];
};

export type FilingStatus = {
  filing_id: string;
  filing_type: 'ct600' | 'accounts';
  company_number?: string;
  company_name?: string;
  period?: { start?: string; end?: string };
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'error';
  hmrc_status?: string | null;
  hmrc_correlation_id?: string | null;
  hmrc_iru_number?: string | null;
  ch_status?: string | null;
  ch_submission_number?: string | null;
  billing_status?: string;
  error?: { code?: string; message?: string };
};

export type Company = {
  company_number: string;
  company_name: string;
  company_type?: string;
  incorporation_date?: string;
  first_year?: boolean;
  directors?: { name: string; role?: string; appointed_on?: string }[];
  accounting_reference_date?: { day?: string | number; month?: string | number } | null;
  next_accounts?: { due_on?: string; period_end_on?: string; period_start_on?: string } | null;
  last_accounts?: { made_up_to?: string } | null;
};

export type DocumentType = 'ct600_pdf' | 'ct600_xml' | 'ixbrl_accounts' | 'accounts_pdf' | 'computations_pdf' | 'computations_ixbrl';
export const DOCUMENT_TYPES: DocumentType[] = ['ct600_pdf', 'ct600_xml', 'computations_pdf', 'computations_ixbrl', 'accounts_pdf', 'ixbrl_accounts'];
export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  ct600_pdf: 'CT600 (PDF)',
  ct600_xml: 'CT600 as sent to HMRC (XML)',
  computations_pdf: 'Tax computations (PDF)',
  computations_ixbrl: 'Tax computations (iXBRL)',
  accounts_pdf: 'Accounts (PDF)',
  ixbrl_accounts: 'Accounts as filed (iXBRL)',
};

export function isTestKey(apiKey: string): boolean {
  return apiKey.startsWith('tt_test_');
}

/** tt_{live|test}_{key_id}_{secret}. */
export function looksLikeKey(apiKey: string): boolean {
  return /^tt_(live|test)_[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(apiKey);
}

/** "tt_live_k1a2…" → "tt_live_k1a2b3c4d5e6_…l5k4": enough to recognise, not to use. */
export function maskKey(apiKey: string): string {
  const parts = apiKey.split('_');
  if (parts.length < 4) return '…' + apiKey.slice(-4);
  return `${parts[0]}_${parts[1]}_${parts[2]}_…${apiKey.slice(-4)}`;
}

type Fetch = typeof fetch;

async function call<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; idempotencyKey?: string; fetchImpl?: Fetch } = {},
): Promise<TinyTaxResult<T>> {
  const headers: Record<string, string> = { 'X-API-Key': apiKey, Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${TINYTAX_BASE}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { ok: false, status: 0, error: { code: 'NETWORK', message: err instanceof Error ? err.message : 'Could not reach TinyTax' } };
  }
  const ra = Number(res.headers.get('retry-after'));
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  let json: { success?: boolean; data?: T; error?: TinyTaxError; request_id?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok && json && json.success !== false) {
    return { ok: true, status: res.status, data: json.data as T, requestId: json.request_id, retryAfter };
  }
  return {
    ok: false,
    status: res.status,
    error: json?.error ?? { code: `HTTP_${res.status}`, message: `TinyTax answered ${res.status}` },
    requestId: json?.request_id,
    retryAfter,
  };
}

export function tinytax(apiKey: string, fetchImpl?: Fetch) {
  return {
    company: (number: string) => call<Company>(apiKey, 'GET', `/companies/${encodeURIComponent(number)}`, { fetchImpl }),
    ct600: (body: Ct600Request, idempotencyKey?: string) =>
      call<DryRun & Submitted>(apiKey, 'POST', '/filings/ct600', { body, idempotencyKey, fetchImpl }),
    accounts: (body: AccountsRequest, idempotencyKey?: string) =>
      call<DryRun & Submitted>(apiKey, 'POST', '/filings/accounts', { body, idempotencyKey, fetchImpl }),
    filing: (id: string) => call<FilingStatus>(apiKey, 'GET', `/filings/${encodeURIComponent(id)}`, { fetchImpl }),
    documents: (id: string) =>
      call<{ filing_id: string; documents: { type: DocumentType; name?: string; size_bytes?: number }[] }>(
        apiKey,
        'GET',
        `/filings/${encodeURIComponent(id)}/documents`,
        { fetchImpl },
      ),
    /** The raw file, or null. */
    async document(id: string, type: DocumentType): Promise<{ bytes: Uint8Array; contentType: string } | null> {
      try {
        const res = await (fetchImpl ?? fetch)(`${TINYTAX_BASE}/filings/${encodeURIComponent(id)}/documents/${type}`, {
          headers: { 'X-API-Key': apiKey },
          cache: 'no-store',
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) return null;
        return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
      } catch {
        return null;
      }
    },
  };
}

/** One line a person can read, from a TinyTax error (field errors listed). */
export function describeError(e: TinyTaxError): string {
  const details = (e.details ?? []).map((d) => [d.field, d.message].filter(Boolean).join(': ')).filter(Boolean);
  return [e.message || e.code, ...details].join(' · ');
}
