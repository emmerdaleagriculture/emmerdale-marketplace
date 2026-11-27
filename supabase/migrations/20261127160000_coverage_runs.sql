-- Info › Coverage map (/info/coverage-map): a machine's track across a
-- field, drawn live from the phone's GPS (or a receiver plugged into it) at
-- a set working width, then saved as a record of the ground covered. A spray
-- record can point at the run it came from; a tank mix of two products is two
-- records pointing at the same run.
create table if not exists public.coverage_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null default 'spray' check (task in ('spray', 'fertiliser', 'seed', 'other')),
  site text check (site is null or char_length(site) <= 200),
  width_m numeric(5, 2) not null check (width_m >= 0.5 and width_m <= 60),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Worked out from the track by the server when the run is saved.
  active_seconds integer not null check (active_seconds >= 0),
  distance_m numeric(10, 1) not null check (distance_m >= 0),
  covered_ha numeric(10, 4) not null check (covered_ha >= 0),
  overlap_ha numeric(10, 4) not null check (overlap_ha >= 0),
  applied_ha numeric(10, 4) not null check (applied_ha >= 0),
  -- Sections of [lng, lat, seconds since start, accuracy m]; a new section
  -- after each pause. Simplified before storing.
  track jsonb not null,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);

comment on table public.coverage_runs is
  'Info > Coverage map: saved machine tracks (working width + GPS track + covered/overlap area). Owner-only via RLS.';

create index if not exists coverage_runs_user_started_idx
  on public.coverage_runs (user_id, started_at desc);

alter table public.coverage_runs enable row level security;

create policy coverage_runs_select_own on public.coverage_runs
  for select to authenticated using (user_id = auth.uid());
create policy coverage_runs_insert_own on public.coverage_runs
  for insert to authenticated with check (user_id = auth.uid());
create policy coverage_runs_update_own on public.coverage_runs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy coverage_runs_delete_own on public.coverage_runs
  for delete to authenticated using (user_id = auth.uid());

-- Default privileges grant anon directly here (`revoke ... from public` is a
-- no-op); a coverage run has no anonymous readers or writers.
revoke all on public.coverage_runs from anon;

-- A spray record may name the run it was sprayed on. Deleting the run keeps
-- the record (the legal record outlives the map).
alter table public.spray_records
  add column if not exists run_id uuid references public.coverage_runs (id) on delete set null;

create index if not exists spray_records_run_idx on public.spray_records (run_id) where run_id is not null;

-- Only to one's own run.
drop policy if exists spray_records_insert_own on public.spray_records;
create policy spray_records_insert_own on public.spray_records
  for insert to authenticated with check (
    user_id = auth.uid()
    and (run_id is null or exists (select 1 from public.coverage_runs r where r.id = run_id and r.user_id = auth.uid()))
  );
drop policy if exists spray_records_update_own on public.spray_records;
create policy spray_records_update_own on public.spray_records
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (run_id is null or exists (select 1 from public.coverage_runs r where r.id = run_id and r.user_id = auth.uid()))
  );
