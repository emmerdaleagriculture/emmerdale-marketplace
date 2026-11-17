-- The app's Diary tab (2026-11-17): a personal diary. Until now the tab opened
-- the won-jobs list; now it opens /app/diary, a month calendar where the
-- signed-in person writes whatever they like against a day: a job they agreed
-- off the phone, a service on the tractor, a reminder. Optional time, optional
-- details, a tick for done. Private to its owner; nobody else (us included,
-- outside the service role) reads it.

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  start_time time,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  details text check (details is null or char_length(details) <= 4000),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.diary_entries is
  'The app Diary tab (/app/diary): free-form entries a user writes against a day. Owner-only via RLS.';

create index if not exists diary_entries_user_date_idx
  on public.diary_entries (user_id, entry_date, start_time);

alter table public.diary_entries enable row level security;

create policy diary_entries_select_own on public.diary_entries
  for select to authenticated using (user_id = auth.uid());
create policy diary_entries_insert_own on public.diary_entries
  for insert to authenticated with check (user_id = auth.uid());
create policy diary_entries_update_own on public.diary_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy diary_entries_delete_own on public.diary_entries
  for delete to authenticated using (user_id = auth.uid());

-- Default privileges grant anon directly here (`revoke … from public` is a
-- no-op); a diary has no anonymous readers or writers.
revoke all on public.diary_entries from anon;

create or replace function public.diary_entries_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.diary_entries_touch() from anon, authenticated;

drop trigger if exists diary_entries_touch on public.diary_entries;
create trigger diary_entries_touch
  before update on public.diary_entries
  for each row execute function public.diary_entries_touch();
