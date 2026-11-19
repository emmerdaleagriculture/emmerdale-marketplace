-- Books, phase 2 (2026-11-19): receipts. A Premium contractor uploads a
-- receipt or invoice (PDF or photo); Claude reads it; the rules either post it
-- straight to the ledger or put it in the review queue with the reasons.
-- Ported from Tally's receipts table. Files live in the private bucket
-- books-receipts at <ledger id>/<sha256[0:2]>/<sha256>.<ext>, read only through
-- the service role. Service-role only, like the rest of books_*.

create table if not exists public.books_receipts (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'posted', 'rejected', 'duplicate', 'failed')),
  source text not null default 'upload' check (source in ('upload', 'email', 'manual')),
  -- Email intake (phase 3).
  email_from text,
  email_to text,
  email_subject text,
  message_id text,
  received_at timestamptz not null default now(),
  -- The stored file.
  file_path text,
  file_name text,
  mime_type text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes int,
  -- What the AI said, whole, and how the read went.
  extracted jsonb,
  extraction_error text,
  confidence numeric(4, 3),
  review_reasons text,
  notes text,
  ai_reads int not null default 0,
  ai_input_tokens int not null default 0,
  ai_output_tokens int not null default 0,
  ai_cost_usd numeric(10, 5) not null default 0,
  -- The reviewed values (filled by the AI, corrected by the person).
  doc_type text check (doc_type is null or doc_type in ('purchase', 'sale')),
  doc_date date,
  counterparty text,
  counterparty_vat_number text,
  reference text,
  description text,
  currency text,
  net_pence bigint,
  vat_pence bigint,
  gross_pence bigint,
  vat_code text,
  account_code text,
  payment_account_code text,
  entry_id bigint references public.books_entries (id) on delete set null,
  processing_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.books_receipts is
  'Books: receipts and invoices uploaded or emailed in, read by AI, posted or held for review. Service-role only.';

create index if not exists books_receipts_ledger_status_idx
  on public.books_receipts (ledger_id, status, received_at desc);
create index if not exists books_receipts_ledger_sha_idx
  on public.books_receipts (ledger_id, sha256);

-- One receipt per entry, and the entry points back.
alter table public.books_entries
  drop constraint if exists books_entries_receipt_id_fkey;
alter table public.books_entries
  add constraint books_entries_receipt_id_fkey
  foreign key (receipt_id) references public.books_receipts (id) on delete set null;
create unique index if not exists books_entries_receipt_uniq
  on public.books_entries (receipt_id) where receipt_id is not null;

alter table public.books_receipts enable row level security;
revoke all on public.books_receipts from public, anon, authenticated;
grant all on public.books_receipts to service_role;

drop trigger if exists books_receipts_touch on public.books_receipts;
create trigger books_receipts_touch
  before update on public.books_receipts
  for each row execute function public.books_ledgers_touch();

-- AI reads this calendar month (UK), for the per-ledger monthly cap.
create or replace function public.books_ai_reads_this_month(p_ledger_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(ai_reads), 0)::int
  from books_receipts
  where ledger_id = p_ledger_id
    and coalesce(processing_started_at, received_at) >= (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London');
$$;
revoke execute on function public.books_ai_reads_this_month(uuid) from public, anon, authenticated;
grant execute on function public.books_ai_reads_this_month(uuid) to service_role;

-- Reserve one AI read for a receipt before calling the API: 'ok', 'cap' (the
-- ledger has used its month's reads) or 'stale' (the receipt was rejected,
-- re-queued or finished since this read started; p_started_at is the
-- processing_started_at the reader saw). The ledger row lock makes the count
-- and the increment one step, so a burst of uploads can't all pass the cap.
create or replace function public.books_reserve_ai_read(p_receipt_id bigint, p_started_at timestamptz, p_cap int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger uuid;
begin
  select ledger_id into v_ledger
  from books_receipts
  where id = p_receipt_id and status = 'processing' and processing_started_at = p_started_at;
  if not found then
    return 'stale';
  end if;
  perform 1 from books_ledgers where id = v_ledger for update;
  if books_ai_reads_this_month(v_ledger) >= p_cap then
    return 'cap';
  end if;
  update books_receipts set ai_reads = ai_reads + 1 where id = p_receipt_id;
  return 'ok';
end;
$$;
revoke execute on function public.books_reserve_ai_read(bigint, timestamptz, int) from public, anon, authenticated;
grant execute on function public.books_reserve_ai_read(bigint, timestamptz, int) to service_role;

-- Private bucket; no storage policies, so only the service role reads or writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'books-receipts', 'books-receipts', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'text/html']
)
on conflict (id) do nothing;
