-- ============================================================================
-- `status = 'sent'` only ever meant "Resend accepted the API call". It never
-- meant the mail arrived.
--
-- On 2026-09-05 a job went out to tom@lumenira.con — a real typo for .com, a
-- domain that does not exist. The portal link and the first-quote alert were
-- both queued, both handed to Resend, and both marked `sent`. Both bounced.
-- /admin/email showed two green rows, and the only way to discover the
-- customer had heard nothing was to read the address by eye.
--
-- Delivery is a separate fact from dispatch, so it gets separate columns.
-- Resend reports it by webhook (email.delivered / bounced / complained /
-- delivery_delayed), matched back by the provider's message id.
-- ============================================================================

alter table pending_emails
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivery_detail text,
  add column if not exists delivery_at timestamptz;

comment on column pending_emails.status is
  'Dispatch: pending / sent (handed to the provider) / failed (never handed over).';
comment on column pending_emails.delivery_status is
  'What the provider reported afterwards: delivered / bounced / complained / delayed. Null = no report yet.';

do $$ begin
  alter table pending_emails add constraint pending_emails_delivery_status_check
    check (delivery_status is null or delivery_status in
           ('delivered','bounced','complained','delayed'));
exception when duplicate_object then null; end $$;

-- The webhook's only lookup key.
create unique index if not exists pending_emails_provider_message_id_idx
  on pending_emails (provider_message_id) where provider_message_id is not null;

-- The admin page asks "what has gone wrong lately", which is a narrow slice
-- of a table that only grows.
create index if not exists pending_emails_delivery_problem_idx
  on pending_emails (delivery_at desc)
  where delivery_status in ('bounced','complained');

-- ── Addresses that have proven undeliverable ────────────────────────────────
-- A hard bounce is a fact about the address, not about the one message that
-- happened to hit it. Kept apart so the next job from the same customer, and
-- the contractor whose invitations have been vanishing for a month, can both
-- be seen at a glance.
create table if not exists undeliverable_emails (
  email          text primary key,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  bounces        int not null default 1,
  last_kind      text,
  last_detail    text
);

alter table undeliverable_emails enable row level security;
-- Service role only: nothing in the app reads this on a customer's behalf.

create or replace function record_undeliverable_email(
  p_email text, p_kind text, p_detail text
) returns void
language sql volatile security definer set search_path = public as $$
  insert into undeliverable_emails (email, last_kind, last_detail)
  values (lower(trim(p_email)), p_kind, p_detail)
  on conflict (email) do update
    set last_seen_at = now(),
        bounces      = undeliverable_emails.bounces + 1,
        last_kind    = excluded.last_kind,
        last_detail  = excluded.last_detail;
$$;

revoke execute on function record_undeliverable_email(text, text, text)
  from public, anon, authenticated;
grant execute on function record_undeliverable_email(text, text, text) to service_role;
