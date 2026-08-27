-- ============================================================================
-- Sealed-quote funnel, step 0: the event log (spec v1.6 §30/§32).
--
-- jobs status says where a job is NOW; every question worth asking — dwell
-- times, drop-off, contractor responsiveness — is about transitions, and
-- those cannot be reconstructed after the fact. These two tables exist
-- before any flow that writes to them. Append-only: never updated, never
-- deleted.
--
-- job_events: every state transition (plus non-transition events worth
-- timing: contact_released, payment_link_issued, quote_received, …).
-- invitation_events: the contractor-side mirror, so response behaviour is
-- measurable per contractor.
-- ============================================================================

-- ── job_events ──────────────────────────────────────────────────────────────
create table if not exists job_events (
  id          bigserial primary key,
  job_id      uuid not null references job_submissions(id),
  event_type  text not null,
  from_status text,
  to_status   text,
  actor_type  text not null check (actor_type in ('client','contractor','system','operator')),
  actor_id    uuid,                       -- null for system
  reason      text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  -- An unlogged manual change is indefensible (§29): operator actions carry a reason.
  constraint job_events_operator_reason check (actor_type <> 'operator' or reason is not null)
);
create index if not exists job_events_job_idx  on job_events (job_id, created_at);
create index if not exists job_events_type_idx on job_events (event_type, created_at);

-- ── invitation_events ───────────────────────────────────────────────────────
-- invitation_id gains its FK in the core-tables migration (job_invitations
-- doesn't exist yet — step-0 ordering is kept literal).
create table if not exists invitation_events (
  id            bigserial primary key,
  invitation_id uuid not null,
  contractor_id uuid not null,
  event_type    text not null check (event_type in
    ('sent','viewed','priced','revised','declined','confirm_pending','confirmed',
     'closed_awarded','closed_stale')),
  metadata      jsonb not null default '{}',  -- time_to_price_seconds, decline_reason, …
  created_at    timestamptz not null default now()
);
create index if not exists invitation_events_invitation_idx on invitation_events (invitation_id);
create index if not exists invitation_events_contractor_idx on invitation_events (contractor_id, created_at);

-- ── log_job_event ───────────────────────────────────────────────────────────
create or replace function log_job_event(
  p_job_id uuid,
  p_event_type text,
  p_from text,
  p_to text,
  p_actor_type text,
  p_actor_id uuid,
  p_reason text,
  p_metadata jsonb
) returns void
language sql volatile security definer set search_path = public as $$
  insert into job_events (job_id, event_type, from_status, to_status, actor_type, actor_id, reason, metadata)
  values (p_job_id, p_event_type, p_from, p_to, p_actor_type, p_actor_id, p_reason, coalesce(p_metadata, '{}'));
$$;
revoke execute on function log_job_event(uuid,text,text,text,text,uuid,text,jsonb) from public;
grant execute on function log_job_event(uuid,text,text,text,text,uuid,text,jsonb) to service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table job_events        enable row level security;
alter table invitation_events enable row level security;
