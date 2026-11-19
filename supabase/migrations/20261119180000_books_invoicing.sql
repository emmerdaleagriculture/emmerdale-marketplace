-- Books, phase 5 (2026-11-19): invoicing (Tally 2.9 / 3.7). A Premium
-- contractor's own customers and invoices: drafts, issue (posts the sale to
-- 1100 Trade debtors), send by email with a PDF and a private link the
-- customer opens without signing in, payments, void. Card payment through
-- the contractor's own Stripe comes in phase 6. Service-role only, like the
-- rest of books_*; the public link is served by the app from its token.

create table if not exists public.books_customers (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  organisation text,
  email text,
  phone text,
  address text,
  vat_number text,
  notes text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists books_customers_ledger_idx on public.books_customers (ledger_id, name);

create table if not exists public.books_invoices (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  customer_id bigint not null references public.books_customers (id) on delete restrict,
  number text not null check (number ~ '^[A-Za-z0-9-]{1,20}$'),
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  issue_date date not null,
  due_date date not null,
  notes text,
  net_pence bigint not null default 0,
  vat_pence bigint not null default 0,
  gross_pence bigint not null default 0,
  paid_pence bigint not null default 0,
  -- The customer's private link (/i/<token>): 24 random bytes, base64url.
  public_token text not null unique,
  entry_id bigint references public.books_entries (id) on delete set null,
  stripe_session_id text,
  sent_at timestamptz,
  sent_to text,
  viewed_at timestamptz,
  paid_at timestamptz,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, number),
  check (due_date >= issue_date),
  check (paid_pence >= 0 and paid_pence <= gross_pence)
);
create index if not exists books_invoices_ledger_status_idx on public.books_invoices (ledger_id, status, issue_date desc);

create table if not exists public.books_invoice_lines (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.books_invoices (id) on delete cascade,
  position int not null,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_pence bigint not null check (unit_pence >= 0),
  vat_code text not null default 'STD' check (vat_code in ('STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'NOVAT')),
  account_code text not null default '4000',
  net_pence bigint not null,
  vat_pence bigint not null
);
create index if not exists books_invoice_lines_invoice_idx on public.books_invoice_lines (invoice_id, position);

create table if not exists public.books_invoice_payments (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.books_invoices (id) on delete cascade,
  paid_on date not null,
  amount_pence bigint not null check (amount_pence > 0),
  method text not null check (method in ('bank', 'stripe', 'owner', 'cash')),
  reference text,
  -- e.g. stripe-pi:<id>; a payment is never recorded twice.
  external_id text,
  entry_id bigint references public.books_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (invoice_id, external_id)
);

create table if not exists public.books_invoice_events (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.books_invoices (id) on delete cascade,
  kind text not null check (kind in ('sent', 'delivered', 'bounced', 'spam', 'failed', 'viewed', 'paid')),
  at timestamptz not null default now(),
  message_id text,
  recipient text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists books_invoice_events_invoice_idx on public.books_invoice_events (invoice_id, at);
create index if not exists books_invoice_events_message_idx on public.books_invoice_events (message_id) where message_id is not null;

alter table public.books_customers enable row level security;
alter table public.books_invoices enable row level security;
alter table public.books_invoice_lines enable row level security;
alter table public.books_invoice_payments enable row level security;
alter table public.books_invoice_events enable row level security;
revoke all on public.books_customers, public.books_invoices, public.books_invoice_lines,
  public.books_invoice_payments, public.books_invoice_events from public, anon, authenticated;
grant all on public.books_customers, public.books_invoices, public.books_invoice_lines,
  public.books_invoice_payments, public.books_invoice_events to service_role;

drop trigger if exists books_customers_touch on public.books_customers;
create trigger books_customers_touch before update on public.books_customers
  for each row execute function public.books_ledgers_touch();
drop trigger if exists books_invoices_touch on public.books_invoices;
create trigger books_invoices_touch before update on public.books_invoices
  for each row execute function public.books_ledgers_touch();

-- Record a payment and its ledger entry in one transaction, keeping
-- paid_pence and status right and refusing more than is due. p_lines are
-- the posting lines (built in the app). Returns the payment id, or the
-- existing one when p_external_id was already recorded.
create or replace function public.books_record_invoice_payment(
  p_invoice_id bigint,
  p_paid_on date,
  p_amount_pence bigint,
  p_method text,
  p_reference text,
  p_external_id text,
  p_entry jsonb,
  p_lines jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv books_invoices%rowtype;
  v_entry bigint;
  v_id bigint;
begin
  select * into v_inv from books_invoices where id = p_invoice_id for update;
  if not found then raise exception 'books: no such invoice'; end if;
  if p_external_id is not null then
    select id into v_id from books_invoice_payments where invoice_id = p_invoice_id and external_id = p_external_id;
    if found then return v_id; end if;
  end if;
  if v_inv.status not in ('issued', 'paid') then raise exception 'books: invoice is not issued'; end if;
  if p_amount_pence <= 0 or p_amount_pence > v_inv.gross_pence - v_inv.paid_pence then
    raise exception 'books: payment is more than is due';
  end if;
  v_entry := books_post_entry(v_inv.ledger_id, p_entry, p_lines);
  insert into books_invoice_payments (invoice_id, paid_on, amount_pence, method, reference, external_id, entry_id)
  values (p_invoice_id, p_paid_on, p_amount_pence, p_method, nullif(p_reference, ''), p_external_id, v_entry)
  returning id into v_id;
  update books_invoices
     set paid_pence = paid_pence + p_amount_pence,
         status = case when paid_pence + p_amount_pence >= gross_pence then 'paid' else 'issued' end,
         paid_at = case when paid_pence + p_amount_pence >= gross_pence then now() else paid_at end
   where id = p_invoice_id;
  return v_id;
end;
$$;
revoke execute on function public.books_record_invoice_payment(bigint, date, bigint, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.books_record_invoice_payment(bigint, date, bigint, text, text, text, jsonb, jsonb) to service_role;
