-- ════════════════════════════════════════════════════════════════════════
-- Contractors change their own bank details (2026-11-20).
--
-- The risk with bank details is not theft (a sort code and account number
-- only let someone pay money in) but a swap: someone in a contractor's
-- account changes them and the next payout goes to the wrong account. So:
--   * a change is confirmed with a code emailed to the contractor
--     (bank_detail_codes holds the pending details and the code's hash);
--   * a change holds payouts for 72 hours (hold_until), and the admin
--     payout panel warns until then;
--   * every change is logged with the last four digits only
--     (bank_detail_changes), for Admin › Security › Audit.
-- All three are sealed like contractor_bank_details: RLS on, no policies,
-- anon/authenticated revoked outright (default privileges grant every new
-- table to them directly; `revoke … from public` does nothing).
-- ════════════════════════════════════════════════════════════════════════

alter table public.contractor_bank_details
  add column if not exists hold_until timestamptz,
  add column if not exists changed_count integer not null default 0;

create table if not exists public.bank_detail_codes (
  contractor_id   uuid primary key references public.contractors(id) on delete cascade,
  code_hash       text not null,
  account_name    text not null,
  sort_code       text not null,
  account_number  text not null,
  attempts        integer not null default 0,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
alter table public.bank_detail_codes enable row level security;
revoke all on public.bank_detail_codes from public, anon, authenticated;
grant all on public.bank_detail_codes to service_role;

create table if not exists public.bank_detail_changes (
  id              uuid primary key default gen_random_uuid(),
  contractor_id   uuid not null references public.contractors(id) on delete cascade,
  old_last4       text,
  new_last4       text not null,
  hold_until      timestamptz,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index if not exists bank_detail_changes_contractor_idx on public.bank_detail_changes (contractor_id, created_at desc);
alter table public.bank_detail_changes enable row level security;
revoke all on public.bank_detail_changes from public, anon, authenticated;
grant all on public.bank_detail_changes to service_role;
