-- Books, phase 1 (2026-11-19): double-entry bookkeeping for Premium (£49,
-- internal tier 'open') contractors, ported from the owner's own app, Tally.
--
-- One ledger per contractor. Every transaction is a balanced double entry
-- held in whole pence. The tables are service-role only, like
-- contractor_payouts: the app reads and writes them from server actions that
-- check the contractor's tier first, and nothing reaches a browser directly.
--
-- Posting goes through books_post_entry(), which resolves account codes in
-- the ledger, refuses an entry that doesn't balance, and writes the entry and
-- its lines in one transaction. external_id makes a re-run of any import a
-- no-op (later phases: receipts, invoices, Stripe, bank rows, marketplace).

create table if not exists public.books_ledgers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null unique references public.contractors (id) on delete cascade,
  business_type text not null default 'sole_trader'
    check (business_type in ('sole_trader', 'limited_company', 'partnership')),
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 200),
  company_number text check (company_number is null or company_number ~ '^[A-Z0-9]{8}$'),
  vat_number text check (vat_number is null or vat_number ~ '^[A-Z0-9]{9,14}$'),
  vat_registered boolean not null default false,
  vat_scheme text not null default 'standard' check (vat_scheme in ('standard', 'cash', 'flat_rate')),
  flat_rate_percent numeric(5, 2) check (flat_rate_percent is null or (flat_rate_percent > 0 and flat_rate_percent < 100)),
  vat_registration_date date,
  -- Accounting year end as MM-DD; null = not set (reports fall back to the last 12 months).
  year_end text check (year_end is null or year_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  base_currency text not null default 'GBP' check (base_currency = 'GBP'),
  default_payment_account text not null default '1200' check (default_payment_account ~ '^[0-9]{4}$'),
  farming boolean not null default true,
  -- Invoicing (phase 5); kept here so settings are one page.
  trading_name text,
  address text,
  phone text,
  invoice_reply_to text,
  bank_details text,
  invoice_terms_days int not null default 7 check (invoice_terms_days between 0 and 120),
  invoice_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.books_ledgers is
  'Books: one set of double-entry books per Premium contractor. Service-role only; access is checked in the app.';

create table if not exists public.books_accounts (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  description text,
  is_fixed_asset boolean not null default false,
  -- System accounts (bank, debtors, VAT) are used by the posting rules and can't be removed.
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (ledger_id, code),
  unique (ledger_id, id)
);

create table if not exists public.books_entries (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  entry_date date not null,
  kind text not null check (kind in ('purchase', 'sale', 'journal')),
  source text not null default 'manual'
    check (source in ('manual', 'mileage', 'receipt', 'invoice', 'stripe', 'bank', 'marketplace', 'prereg')),
  counterparty text,
  reference text,
  description text,
  vat_code text not null default 'OUTSIDE'
    check (vat_code in ('STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'RC', 'BLOCKED', 'NOVAT', 'PREREG')),
  -- Copied here so the VAT return is a plain query over entries.
  net_pence bigint not null default 0,
  vat_pence bigint not null default 0,
  gross_pence bigint not null default 0,
  is_capital boolean not null default false,
  receipt_id bigint,
  -- Provider / import key (stripe txn id, bank row hash, inv:…); stops double booking.
  external_id text,
  -- Source-specific detail, e.g. mileage {miles, driver, journey, purpose, rate_pence}.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (ledger_id, external_id)
);

create index if not exists books_entries_ledger_date_idx
  on public.books_entries (ledger_id, entry_date desc, id desc);

create table if not exists public.books_lines (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.books_entries (id) on delete cascade,
  ledger_id uuid not null,
  account_id bigint not null,
  debit_pence bigint not null default 0 check (debit_pence >= 0),
  credit_pence bigint not null default 0 check (credit_pence >= 0),
  memo text,
  check ((debit_pence = 0) <> (credit_pence = 0)),
  -- A line's account must be in the same ledger as its entry.
  foreign key (ledger_id, account_id) references public.books_accounts (ledger_id, id) on delete restrict
);

create index if not exists books_lines_entry_idx on public.books_lines (entry_id);
create index if not exists books_lines_account_idx on public.books_lines (ledger_id, account_id);

-- Lines with their entry and account, for the account ledger and the CSV
-- (read with fetchAll: PostgREST caps a response at 1000 rows).
create or replace view public.books_line_view
with (security_invoker = true) as
select
  l.id as line_id,
  l.ledger_id,
  e.id as entry_id,
  e.entry_date,
  e.kind,
  e.source,
  e.counterparty,
  e.reference,
  e.description,
  e.vat_code,
  e.receipt_id,
  a.code as account_code,
  a.name as account_name,
  a.type as account_type,
  l.debit_pence,
  l.credit_pence,
  l.memo
from public.books_lines l
join public.books_entries e on e.id = l.entry_id
join public.books_accounts a on a.id = l.account_id;

alter table public.books_ledgers enable row level security;
alter table public.books_accounts enable row level security;
alter table public.books_entries enable row level security;
alter table public.books_lines enable row level security;

-- Default privileges grant anon/authenticated directly (`revoke … from public`
-- alone is a no-op here). No policies: service role only.
revoke all on public.books_ledgers, public.books_accounts, public.books_entries, public.books_lines,
  public.books_line_view from public, anon, authenticated;
grant all on public.books_ledgers, public.books_accounts, public.books_entries, public.books_lines,
  public.books_line_view to service_role;

create or replace function public.books_ledgers_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.books_ledgers_touch() from public, anon, authenticated;

drop trigger if exists books_ledgers_touch on public.books_ledgers;
create trigger books_ledgers_touch
  before update on public.books_ledgers
  for each row execute function public.books_ledgers_touch();

-- Post one balanced entry. p_entry: {entry_date, kind, source, counterparty,
-- reference, description, vat_code, net_pence, vat_pence, gross_pence,
-- is_capital, receipt_id, external_id, meta}. p_lines: [{code, debit, credit,
-- memo}]. Returns the entry id; with an external_id already booked, returns
-- the existing entry's id and books nothing.
create or replace function public.books_post_entry(p_ledger_id uuid, p_entry jsonb, p_lines jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_ext text := nullif(p_entry->>'external_id', '');
  v_line jsonb;
  v_acct bigint;
  v_dr bigint := 0;
  v_cr bigint := 0;
  v_n int := 0;
begin
  if p_ledger_id is null or not exists (select 1 from books_ledgers where id = p_ledger_id) then
    raise exception 'books: no such ledger';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'books: an entry needs at least two lines';
  end if;

  if v_ext is not null then
    select id into v_id from books_entries where ledger_id = p_ledger_id and external_id = v_ext;
    if found then
      return v_id;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce((v_line->>'debit')::bigint, 0) < 0 or coalesce((v_line->>'credit')::bigint, 0) < 0 then
      raise exception 'books: negative amount on a line';
    end if;
    v_dr := v_dr + coalesce((v_line->>'debit')::bigint, 0);
    v_cr := v_cr + coalesce((v_line->>'credit')::bigint, 0);
  end loop;
  if v_dr <> v_cr or v_dr = 0 then
    raise exception 'books: entry does not balance (debits %, credits %)', v_dr, v_cr;
  end if;

  insert into books_entries (
    ledger_id, entry_date, kind, source, counterparty, reference, description, vat_code,
    net_pence, vat_pence, gross_pence, is_capital, receipt_id, external_id, meta
  ) values (
    p_ledger_id,
    (p_entry->>'entry_date')::date,
    p_entry->>'kind',
    coalesce(p_entry->>'source', 'manual'),
    nullif(p_entry->>'counterparty', ''),
    nullif(p_entry->>'reference', ''),
    nullif(p_entry->>'description', ''),
    coalesce(p_entry->>'vat_code', 'OUTSIDE'),
    coalesce((p_entry->>'net_pence')::bigint, 0),
    coalesce((p_entry->>'vat_pence')::bigint, 0),
    coalesce((p_entry->>'gross_pence')::bigint, 0),
    coalesce((p_entry->>'is_capital')::boolean, false),
    (p_entry->>'receipt_id')::bigint,
    v_ext,
    coalesce(p_entry->'meta', '{}'::jsonb)
  )
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    -- Zero lines (e.g. no VAT) are dropped rather than refused.
    continue when coalesce((v_line->>'debit')::bigint, 0) = 0 and coalesce((v_line->>'credit')::bigint, 0) = 0;
    select id into v_acct from books_accounts where ledger_id = p_ledger_id and code = v_line->>'code';
    if not found then
      raise exception 'books: account % does not exist', v_line->>'code';
    end if;
    insert into books_lines (entry_id, ledger_id, account_id, debit_pence, credit_pence, memo)
    values (
      v_id, p_ledger_id, v_acct,
      coalesce((v_line->>'debit')::bigint, 0),
      coalesce((v_line->>'credit')::bigint, 0),
      nullif(v_line->>'memo', '')
    );
    v_n := v_n + 1;
  end loop;
  if v_n < 2 then
    raise exception 'books: an entry needs at least two non-zero lines';
  end if;

  return v_id;
end;
$$;

-- Account totals for the trial balance and P&L, optionally for a date range.
-- Every account is listed, with zero totals where nothing has posted.
create or replace function public.books_trial_balance(p_ledger_id uuid, p_from date default null, p_to date default null)
returns table (
  code text,
  name text,
  type text,
  is_fixed_asset boolean,
  is_system boolean,
  debit_pence bigint,
  credit_pence bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select a.code, a.name, a.type, a.is_fixed_asset, a.is_system,
         coalesce(sum(l.debit_pence), 0)::bigint,
         coalesce(sum(l.credit_pence), 0)::bigint
  from books_accounts a
  -- Date filter inside the join, so an account with no lines in range still lists.
  left join (
    books_lines l
    join books_entries e
      on e.id = l.entry_id
     and (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
  ) on l.account_id = a.id
  where a.ledger_id = p_ledger_id
  group by a.id
  order by a.code;
$$;

-- An account's net movement (debits − credits) before a date: the opening
-- balance of the account ledger page.
create or replace function public.books_account_opening(p_ledger_id uuid, p_code text, p_before date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.debit_pence - l.credit_pence), 0)::bigint
  from books_lines l
  join books_accounts a on a.id = l.account_id
  join books_entries e on e.id = l.entry_id
  where a.ledger_id = p_ledger_id and a.code = p_code and e.entry_date < p_before;
$$;

-- Business miles already claimed by one driver in a tax year (6 Apr – 5 Apr),
-- for the 10,000-mile switch from the higher to the lower HMRC rate.
create or replace function public.books_mileage_claimed(p_ledger_id uuid, p_driver text, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((meta->>'miles')::numeric), 0)
  from books_entries
  where ledger_id = p_ledger_id
    and source = 'mileage'
    and lower(btrim(meta->>'driver')) = lower(btrim(p_driver))
    and entry_date between p_from and p_to;
$$;

revoke execute on function public.books_post_entry(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.books_trial_balance(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.books_account_opening(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.books_mileage_claimed(uuid, text, date, date) from public, anon, authenticated;
grant execute on function public.books_post_entry(uuid, jsonb, jsonb) to service_role;
grant execute on function public.books_trial_balance(uuid, date, date) to service_role;
grant execute on function public.books_account_opening(uuid, text, date) to service_role;
grant execute on function public.books_mileage_claimed(uuid, text, date, date) to service_role;
