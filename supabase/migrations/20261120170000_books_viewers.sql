-- Books: people a contractor lets see their books (an accountant, a
-- bookkeeper, a business partner). Read only, always. The owner invites by
-- email from Books › Settings; the invitation link carries a token, and it is
-- accepted by signing in (or creating an account) with that same address,
-- which stamps user_id. Removing someone stamps revoked_at; they lose access
-- on their next page load. Service-role only, like the rest of books_*.

create table if not exists public.books_viewers (
  id bigint generated always as identity primary key,
  ledger_id uuid not null references public.books_ledgers (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  name text check (name is null or char_length(name) <= 120),
  token uuid not null unique default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

-- One live invitation per address per ledger; a removed one can be re-invited.
create unique index if not exists books_viewers_live_uidx
  on public.books_viewers (ledger_id, email) where revoked_at is null;
create index if not exists books_viewers_user_idx
  on public.books_viewers (user_id) where revoked_at is null;

alter table public.books_viewers enable row level security;
revoke all on public.books_viewers from public, anon, authenticated;
grant all on public.books_viewers to service_role;
