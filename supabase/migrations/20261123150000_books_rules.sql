-- Books: the owner's own rules for bank rows and receipts. "Payee or
-- supplier contains X" -> the account it goes to, its VAT, and what pays it
-- (2300 paid personally, 2100 on credit). Rules beat history and the AI.
create table if not exists public.books_rules (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers(id) on delete cascade,
  match_text text not null check (length(btrim(match_text)) between 2 and 100),
  direction text not null default 'any' check (direction in ('any', 'in', 'out')),
  account_code text,
  vat_code text,
  paid_from text,
  created_at timestamptz not null default now(),
  check (account_code is not null or paid_from is not null)
);

create index if not exists books_rules_ledger_idx on public.books_rules (ledger_id);

comment on table public.books_rules is
  'Books: owner rules (text match -> account / VAT / paid from) for bank statement rows and receipts. Service-role only.';

alter table public.books_rules enable row level security;
revoke all on public.books_rules from public, anon, authenticated;
grant all on public.books_rules to service_role;
