-- Books: a mileage trip that has been started but not finished. The driver
-- reads the odometer when they set off and won't know the finish reading
-- until they're back, so the start is kept here until the claim is posted
-- (the row is then deleted: the claim itself lives in books_entries).
create table if not exists public.books_mileage_trips (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  trip_date date not null,
  driver text not null check (char_length(btrim(driver)) between 1 and 100),
  odometer_start numeric(9, 1) not null check (odometer_start >= 0),
  journey text,
  purpose text,
  pay_code text check (pay_code is null or pay_code ~ '^[0-9]{4}$'),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists books_mileage_trips_ledger_idx on public.books_mileage_trips (ledger_id, created_at desc);

comment on table public.books_mileage_trips is
  'Books: mileage trips started (odometer at start saved) and not yet claimed. Deleted when the claim posts. Service-role only.';

alter table public.books_mileage_trips enable row level security;
revoke all on public.books_mileage_trips from public, anon, authenticated;
grant all on public.books_mileage_trips to service_role;
