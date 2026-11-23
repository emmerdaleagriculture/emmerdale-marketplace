-- Books: year-end filing through TinyTax (2026-11-23). A limited company's
-- accounts go to Companies House and its CT600 to HMRC through TinyTax's
-- Filing API, on the company's own TinyTax key. Released account by account
-- (app_config tinytax_allowlist, like books_allowlist), HPM first.
--
-- Secrets (the TinyTax key, Government Gateway login and Companies House
-- authentication code) are one AES-256-GCM blob in filing_secrets, sealed by
-- the app with BOOKS_SECRETS_KEY (src/lib/books/secrets.ts). The database
-- never sees them in the clear. Service-role only, like the rest of books_*.

-- company_number already exists (ledger core, set in Settings).
alter table public.books_ledgers
  add column if not exists filing_secrets text;

comment on column public.books_ledgers.filing_secrets is
  'Encrypted (app-side AES-256-GCM, BOOKS_SECRETS_KEY, ledger id as AAD) JSON of the TinyTax key, Government Gateway ID/password and Companies House auth code.';

-- The figures being prepared for a year end, as last edited and checked.
create table if not exists public.books_year_ends (
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  period_end date not null,
  period_start date not null,
  figures jsonb not null,
  -- Last TinyTax dry runs: { ct600: {...}, accounts: {...}, at }
  last_check jsonb,
  updated_at timestamptz not null default now(),
  primary key (ledger_id, period_end)
);

-- Every filing sent to TinyTax, and what became of it.
create table if not exists public.books_filings (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.books_ledgers (id) on delete restrict,
  kind text not null check (kind in ('ct600', 'accounts')),
  period_start date not null,
  period_end date not null,
  -- Sent with a tt_test_ key: TinyTax's sandbox, nothing reached HMRC or Companies House.
  sandbox boolean not null,
  -- Used as the Idempotency-Key, so a retried submission can't file twice.
  idempotency_key uuid not null default gen_random_uuid() unique,
  tinytax_filing_id text,
  status text not null default 'sending' check (status in ('sending', 'pending', 'submitted', 'accepted', 'rejected', 'error', 'failed')),
  -- What was sent, without credentials.
  request jsonb not null,
  response jsonb,
  last_status jsonb,
  error text,
  -- [{ type, path, size }] copies in the books-receipts bucket under filings/.
  documents jsonb not null default '[]'::jsonb,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_poll_at timestamptz
);

create index if not exists books_filings_ledger_idx on public.books_filings (ledger_id, period_end desc, created_at desc);
-- One live (not failed) filing of each kind per year; a rejected one can be filed again.
create unique index if not exists books_filings_live_uidx
  on public.books_filings (ledger_id, kind, period_end, sandbox)
  where status in ('sending', 'pending', 'submitted', 'accepted');

alter table public.books_year_ends enable row level security;
alter table public.books_filings enable row level security;
revoke all on public.books_year_ends from public, anon, authenticated;
revoke all on public.books_filings from public, anon, authenticated;
grant all on public.books_year_ends to service_role;
grant all on public.books_filings to service_role;

-- Released to HPM first. Missing or unreadable = nobody.
insert into public.app_config (key, value)
values ('tinytax_allowlist', '["tom@hampshirepaddockmanagement.com"]'::jsonb)
on conflict (key) do nothing;
