-- Books phases 7 and 8.
--
-- 7. Bank statement uploads (Tally 2.11 / 3.9). A statement is a CSV the
--    contractor uploads for one bank or card account. Its rows are kept with
--    the upload so the statement page can show, at any time, which rows are
--    in the books, which match something already there, and how the
--    statement reconciles with the books. Importing a row posts an entry
--    whose external_id is bank:<account>:<row key>, so a row is never booked
--    twice, even from an overlapping statement.
--
-- 8. Marketplace jobs post themselves: a signed-off job is a sale to
--    Emmerdale Agriculture Online Ltd at the contractor price (Dr 1100 /
--    Cr 4000), and our payout settles it (Dr 1200 / Cr 1100). A switch and a
--    start date on the ledger; only jobs finished on or after the start date
--    are brought in, so books that already include earlier work in their
--    opening balances aren't doubled.

create table if not exists public.books_bank_statements (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  account_code text not null check (account_code ~ '^[0-9]{4}$'),
  file_name text not null check (char_length(file_name) between 1 and 200),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  row_count int not null check (row_count between 1 and 20000),
  opening_balance_pence bigint,
  closing_balance_pence bigint,
  -- [{key, date, payee, description, amount, balance, type}] in date order.
  rows jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists books_bank_statements_ledger_idx
  on public.books_bank_statements (ledger_id, account_code, end_date desc);

comment on table public.books_bank_statements is
  'Books: uploaded bank statement CSVs, rows kept for reconciliation. Service-role only.';

alter table public.books_bank_statements enable row level security;
revoke all on public.books_bank_statements from public, anon, authenticated;
grant all on public.books_bank_statements to service_role;

alter table public.books_ledgers
  add column if not exists marketplace_auto boolean not null default true,
  -- Jobs finished on or after this date are booked; null = the day the books were set up.
  add column if not exists marketplace_from date;

-- The line view gains each entry's external_id (added at the end, as a
-- replaced view must keep its columns in order), for statement matching.
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
  l.memo,
  e.external_id
from public.books_lines l
join public.books_entries e on e.id = l.entry_id
join public.books_accounts a on a.id = l.account_id;

revoke all on public.books_line_view from public, anon, authenticated;
grant select on public.books_line_view to service_role;
