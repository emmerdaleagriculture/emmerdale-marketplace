-- Books (2026-11-19): fixes from the full review.
--
-- 1. The monthly AI-read cap summed the lifetime reads of any receipt
--    touched this month, so re-reading an old receipt pulled its earlier
--    reads into this month. Each read is now its own row, counted by when it
--    happened. books_reserve_ai_read writes the row in the same step as the
--    check (under the ledger lock), so the cap still holds under a burst.
-- 2. A card payment confirmed twice at once (the return from Checkout and the
--    webhook) recorded one payment but two 'paid' events and two alerts. A
--    unique 'paid' event per payment reference lets only one caller through.

create table if not exists public.books_ai_reads (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  receipt_id bigint references public.books_receipts (id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists books_ai_reads_ledger_at_idx on public.books_ai_reads (ledger_id, at);
alter table public.books_ai_reads enable row level security;
revoke all on public.books_ai_reads from public, anon, authenticated;
grant all on public.books_ai_reads to service_role;

-- Carry over this month's reads so the cap doesn't reset mid-month.
insert into public.books_ai_reads (ledger_id, receipt_id, at)
select r.ledger_id, r.id, coalesce(r.processing_started_at, r.received_at)
from public.books_receipts r, generate_series(1, r.ai_reads) g
where r.ai_reads > 0
  and coalesce(r.processing_started_at, r.received_at) >= (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London')
  and not exists (select 1 from public.books_ai_reads a where a.receipt_id = r.id);

create or replace function public.books_ai_reads_this_month(p_ledger_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from books_ai_reads
  where ledger_id = p_ledger_id
    and at >= (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London');
$$;

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
  insert into books_ai_reads (ledger_id, receipt_id) values (v_ledger, p_receipt_id);
  update books_receipts set ai_reads = ai_reads + 1 where id = p_receipt_id;
  return 'ok';
end;
$$;

create unique index if not exists books_invoice_events_paid_once
  on public.books_invoice_events (invoice_id, message_id) where kind = 'paid' and message_id is not null;
