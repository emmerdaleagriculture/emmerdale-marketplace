-- ════════════════════════════════════════════════════════════════════════
-- Contractor payouts, recorded.
--
-- Payouts are made by hand (bank transfer) once the balance has cleared and
-- the contractor's invoice is in. Until now nothing recorded one, so the
-- money page's "owed to contractors" counted every finished job forever.
-- One row per job: the amount actually sent and the day it went.
--
-- Its own table, not columns on job_submissions: a customer can read their
-- own job row in full (job_submissions_select_own), and the amount paid out
-- is the contractor's price — the one figure the customer is never shown
-- (§29). Sealed like feedback and client_quotes: RLS on, no policies, and
-- anon/authenticated revoked outright, because default privileges grant
-- them every new table directly (a `revoke … from public` does nothing).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists contractor_payouts (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null unique references job_submissions(id) on delete cascade,
  contractor_id  uuid not null references contractors(id),
  amount_pence   integer not null check (amount_pence > 0),
  -- The day the money went, as the operator says — not when it was typed in.
  paid_on        date not null,
  note           text,
  recorded_by    uuid,
  created_at     timestamptz not null default now()
);

create index if not exists contractor_payouts_contractor_idx on contractor_payouts (contractor_id);

alter table contractor_payouts enable row level security;
-- No policies on purpose. Service role only.
revoke all on contractor_payouts from anon, authenticated;

comment on table contractor_payouts is
  'Payouts sent to contractors by hand, one per job. Service role only: amount_pence is the contractor price, never shown to customers.';
