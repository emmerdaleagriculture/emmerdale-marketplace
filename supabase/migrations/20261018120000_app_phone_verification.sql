-- ============================================================================
-- A verified mobile number for everyone who uses the app (PRD task 5).
--
-- The number itself is verified by Supabase Auth: updateUser({ phone }) sends
-- a code through the phone provider (Twilio Verify) and verifyOtp with type
-- phone_change confirms it, after which auth.users.phone holds the number and
-- the JWT carries a `phone` claim — which is what the app's middleware gate
-- reads. These columns record the outcome on the profile rows the rest of
-- the site reads from, and when.
--
-- phone_verifications is the app's own bookkeeping around that: when a code
-- was last sent (resend after 30 s), how many wrong codes in a row (five →
-- a ten-minute lockout), and — for an Apple "Hide My Email" sign-in whose
-- relay address matched nothing — which existing account carries the same
-- verified number, so the person can be asked whether it is theirs.
-- Service role only.
-- ============================================================================

alter table public.customers
  add column if not exists phone_verified_at timestamptz;
alter table public.contractors
  add column if not exists phone_verified_at timestamptz;

-- The Hide-My-Email match looks up a verified number across both tables.
create index if not exists customers_verified_phone_idx
  on public.customers (phone) where phone_verified_at is not null;
create index if not exists contractors_verified_phone_idx
  on public.contractors (phone) where phone_verified_at is not null;

create table if not exists public.phone_verifications (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  -- The number the current code was sent to, E.164.
  phone          text,
  last_sent_at   timestamptz,
  failures       int not null default 0,
  locked_until   timestamptz,
  verified_at    timestamptz,
  -- Another account already holding this verified number, awaiting the
  -- person's answer on the match screen. Cleared once answered.
  match_user_id  uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from public, anon, authenticated;
grant all on public.phone_verifications to service_role;
