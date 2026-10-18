-- ============================================================================
-- Delete my account, from the app (PRD task 10; Apple requires it).
--
-- Two things the database has to allow for:
--
-- 1. A contractor's login can go while their records stay. Quotes, awarded
--    jobs, ratings and payouts reference contractors(id) without cascade,
--    on purpose: they carry customers' prices and payments and are kept for
--    the statutory six years. Until now contractors.id cascaded from
--    auth.users, so a contractor with any history could not have their
--    login deleted at all (the admin tool suspends them instead). The
--    cascade goes: deleting the auth user leaves the contractors row as a
--    tombstone, scrubbed of personal details by the app (lib/deleteAccount),
--    and the admin tool deletes the row itself where it can.
--
-- 2. Apple's token has to be revoked when a Sign in with Apple user deletes
--    their account. Revoking needs a token Apple issued, which neither the
--    native sheet nor Supabase keeps, so the refresh token from the code
--    exchange is stored here at sign-in. Service role only.
-- ============================================================================

alter table public.contractors drop constraint if exists contractors_id_fkey;

create table if not exists public.apple_tokens (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  -- Which Apple client the token was issued to: the Services ID (web) or
  -- the app's bundle id (native). Revocation must use the same one.
  client_id      text not null,
  refresh_token  text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
revoke all on public.apple_tokens from public, anon, authenticated;
grant all on public.apple_tokens to service_role;
