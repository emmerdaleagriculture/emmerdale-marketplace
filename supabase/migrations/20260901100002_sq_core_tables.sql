-- ============================================================================
-- Sealed-quote funnel: core tables, state machine, RLS, portal views.
--
-- The two-contract principal model (§14) is enforced structurally, not by
-- SELECT discipline: contractor prices and client prices live in different
-- tables with different access paths. contractor_quotes is readable only by
-- its own contractor (RLS on auth.uid()); client_quotes has no policies at
-- all — the tokenised client portal is served by server code that picks its
-- columns explicitly. A leak requires changing this file, not forgetting a
-- WHERE clause.
--
-- Client identity and exact location are withheld from contractors until
-- award: the my_sq_invitations view structurally cannot contain contact
-- columns, the full postcode, coordinates or the gate what3words; the
-- boundary polygon IS exposed (spec §26a.4 — it is what makes remote
-- pricing viable).
-- ============================================================================

-- ── job_submissions: state machine + funnel columns ─────────────────────────
-- Full v1.6 §31 status set now (Part 3 states included so no later churn);
-- Part 2 uses: confirmed → distributed → quotes_receiving →
-- accepted_awaiting_payment → awarded → completed, terminals
-- cancelled/no_matches/no_quotes/expired.
alter table job_submissions drop constraint if exists job_submissions_status_check;
alter table job_submissions add constraint job_submissions_status_check
  check (status in (
    'draft','confirmed','abandoned',
    'distributed','quotes_receiving','accepted_awaiting_payment',
    'awarded','contacted','scheduled','in_progress','completed_by_contractor',
    'completed','paid',
    'cancelled','no_matches','no_quotes','expired',
    'variation_pending','variation_declined','disputed'
  ));

alter table job_submissions add column if not exists distributed_at           timestamptz;
alter table job_submissions add column if not exists expires_at               timestamptz;  -- stored at distribution; config changes never shift live jobs
alter table job_submissions add column if not exists client_token             text unique;
alter table job_submissions add column if not exists client_token_revoked_at  timestamptz;
alter table job_submissions add column if not exists accepted_client_quote_id uuid;
alter table job_submissions add column if not exists awarded_contractor_id    uuid references contractors(id);
alter table job_submissions add column if not exists awarded_at               timestamptz;
alter table job_submissions add column if not exists quotes_notified_at       timestamptz;  -- 6-hourly client digest cursor

create index if not exists job_submissions_open_idx
  on job_submissions (status, expires_at)
  where status in ('distributed','quotes_receiving','accepted_awaiting_payment');

-- ── job_invitations ─────────────────────────────────────────────────────────
create table if not exists job_invitations (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references job_submissions(id),
  contractor_id  uuid not null references contractors(id),
  token          text not null unique,
  status         text not null default 'sent'
                   check (status in ('sent','viewed','priced','declined','closed_awarded','closed_stale')),
  decline_reason text check (decline_reason in ('too_far','too_busy','wrong_service','not_interested')),
  distance_miles numeric,             -- display only, computed at match time (§15)
  sent_at        timestamptz not null default now(),
  opened_at      timestamptz,
  unique (submission_id, contractor_id)   -- idempotent re-distribution
);
create index if not exists job_invitations_submission_idx on job_invitations (submission_id);
create index if not exists job_invitations_contractor_idx on job_invitations (contractor_id, status);

alter table invitation_events
  drop constraint if exists invitation_events_invitation_fk;
alter table invitation_events
  add constraint invitation_events_invitation_fk
  foreign key (invitation_id) references job_invitations(id);

-- ── contractor_quotes ───────────────────────────────────────────────────────
-- An email-parsed figure is never live without the contractor's one-click
-- confirm (§17): it is born confirmed_by_contractor = false and has no
-- client_quotes row until confirmed.
create table if not exists contractor_quotes (
  id                      uuid primary key default gen_random_uuid(),
  submission_id           uuid not null references job_submissions(id),
  contractor_id           uuid not null references contractors(id),
  invitation_id           uuid not null references job_invitations(id),
  quote_type              text not null default 'total' check (quote_type in ('total','rate')),
  contractor_price_pence  int not null check (contractor_price_pence > 0),  -- for 'rate': indicative total
  rate_value_pence        int check (rate_value_pence > 0),
  rate_minimum_pence      int,
  price_basis             text not null default 'unspecified',  -- §14 VAT reservation; nothing reads it
  notes_internal          text,                                 -- to Emmerdale, never forwarded verbatim
  site_visit_required     boolean not null default false,
  valid_until             date not null,
  source                  text not null check (source in ('form','email_parsed')),
  confirmed_by_contractor boolean not null default true,
  confirm_token           text unique,
  superseded_by           uuid references contractor_quotes(id),
  created_at              timestamptz not null default now(),
  constraint cq_rate_needs_value check (quote_type <> 'rate' or rate_value_pence is not null),
  constraint cq_form_born_confirmed check (source <> 'form' or confirmed_by_contractor)
);
create index if not exists contractor_quotes_submission_idx on contractor_quotes (submission_id);
create index if not exists contractor_quotes_contractor_idx on contractor_quotes (contractor_id);
-- Exactly one live, confirmed quote per contractor per job — at the DB layer.
create unique index if not exists contractor_quotes_one_live_idx
  on contractor_quotes (submission_id, contractor_id)
  where superseded_by is null and confirmed_by_contractor;

-- ── client_quotes ───────────────────────────────────────────────────────────
create table if not exists client_quotes (
  id                       uuid primary key default gen_random_uuid(),
  submission_id            uuid not null references job_submissions(id),
  contractor_quote_id      uuid not null unique references contractor_quotes(id),
  contractor_id            uuid not null references contractors(id),  -- never serialized to the client
  client_price_pence       int not null check (client_price_pence > 0),  -- stored, never computed on read (§18)
  markup_rate              numeric not null,                             -- rate in force at creation
  client_rate_value_pence  int,
  client_rate_minimum_pence int,
  contractor_display_label text not null,   -- "Contractor A" — stable per contractor per submission
  contractor_real_name     text,            -- null until award (§18)
  contractor_rating_avg    numeric,
  contractor_rating_count  int not null default 0,
  distance_miles           numeric,
  site_visit_required      boolean not null default false,
  valid_until              date not null,
  status                   text not null default 'active'
                             check (status in ('active','superseded','accepted','closed')),
  created_at               timestamptz not null default now()
);
create index if not exists client_quotes_submission_idx on client_quotes (submission_id, status);

alter table job_submissions
  drop constraint if exists job_submissions_accepted_quote_fk;
alter table job_submissions
  add constraint job_submissions_accepted_quote_fk
  foreign key (accepted_client_quote_id) references client_quotes(id);

-- ── job_payments ────────────────────────────────────────────────────────────
-- subscriptions is contractor-keyed and cannot represent a client payment.
create table if not exists job_payments (
  id                         uuid primary key default gen_random_uuid(),
  submission_id              uuid not null references job_submissions(id),
  client_quote_id            uuid not null references client_quotes(id),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  amount_pence               int not null,
  currency                   text not null default 'gbp',
  status                     text not null default 'pending'
                               check (status in ('pending','paid','expired','failed','refunded','partially_refunded')),
  expires_at                 timestamptz not null,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now()
);
create index if not exists job_payments_submission_idx on job_payments (submission_id);
create index if not exists job_payments_pending_idx on job_payments (expires_at) where status = 'pending';

-- ── contractor_ratings ──────────────────────────────────────────────────────
create table if not exists contractor_ratings (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references job_submissions(id),  -- one per job (§18a)
  contractor_id uuid not null references contractors(id),
  stars         int not null check (stars between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);

-- ── submission_notifications ────────────────────────────────────────────────
-- One-shot dedupe for funnel emails (job_notifications FKs the open-access
-- jobs table and can't be reused). recipient = client email, contractor
-- id::text, or '__admin__'.
create table if not exists submission_notifications (
  submission_id uuid not null references job_submissions(id),
  recipient     text not null,
  kind          text not null,
  sent_at       timestamptz not null default now(),
  primary key (submission_id, recipient, kind)
);

-- ── inbound_email_events ────────────────────────────────────────────────────
-- Audit for the most fragile link in the chain (§17 reply parsing).
create table if not exists inbound_email_events (
  id            bigserial primary key,
  invitation_id uuid references job_invitations(id),
  from_email    text not null,
  to_email      text not null,
  raw_excerpt   text,
  parsed        jsonb,
  outcome       text not null check (outcome in
    ('quote_pending_confirm','declined','no_figure','no_token','unknown_sender','error')),
  created_at    timestamptz not null default now()
);
create index if not exists inbound_email_events_invitation_idx on inbound_email_events (invitation_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table job_invitations          enable row level security;
alter table contractor_quotes        enable row level security;
alter table client_quotes            enable row level security;
alter table job_payments             enable row level security;
alter table contractor_ratings       enable row level security;
alter table submission_notifications enable row level security;
alter table inbound_email_events     enable row level security;

-- Contractors read only their own rows (§19: RLS, not application filtering).
-- All writes go through security-definer RPCs.
drop policy if exists inv_select_own on job_invitations;
create policy inv_select_own on job_invitations
  for select to authenticated using (contractor_id = auth.uid());
drop policy if exists cq_select_own on contractor_quotes;
create policy cq_select_own on contractor_quotes
  for select to authenticated using (contractor_id = auth.uid());
-- client_quotes / job_payments / ratings / notifications / inbound: sealed.

-- ── Portal views ────────────────────────────────────────────────────────────
-- security_invoker = false + explicit column lists: what is not selected
-- cannot leak. District only, never the full postcode; no contact fields,
-- no coordinates, no what3words until award.
drop view if exists my_sq_invitations;
create view my_sq_invitations
with (security_invoker = false) as
select
  i.id,
  i.token,
  i.status,
  i.decline_reason,
  i.distance_miles,
  i.sent_at,
  i.opened_at,
  js.id                                as submission_id,
  s.name                               as service,
  split_part(js.postcode, ' ', 1)      as postcode_district,
  c.name                               as county,
  js.area_value,
  js.area_unit,
  js.area_mapped_value,
  js.area_source,
  js.boundary,
  js.urgency,
  js.target_date,
  js.access_notes,
  js.obstacles,
  js.gate_width,
  js.service_attributes,
  js.expires_at,
  case when js.status in ('distributed','quotes_receiving','accepted_awaiting_payment')
       then 'open' else 'closed' end   as job_state
from job_invitations i
join job_submissions js on js.id = i.submission_id
left join services s on s.id = js.service_id
left join counties c on c.id = js.county_id
where i.contractor_id = auth.uid();
grant select on my_sq_invitations to authenticated;

drop view if exists my_sq_won_jobs;
create view my_sq_won_jobs
with (security_invoker = false) as
select
  js.id,
  s.name                    as service,
  js.contact_name,
  js.contact_phone,
  js.contact_email,
  js.contact_preference,
  js.postcode,
  js.lat,
  js.lng,
  js.gate_w3w,
  js.gate_width,
  js.access_notes,
  js.obstacles,
  js.area_value,
  js.area_unit,
  js.area_mapped_value,
  js.boundary,
  js.urgency,
  js.target_date,
  js.service_attributes,
  js.status,
  js.awarded_at,
  c.name                    as county,
  cq.contractor_price_pence
from job_submissions js
join services s on s.id = js.service_id
left join counties c on c.id = js.county_id
left join client_quotes clq on clq.id = js.accepted_client_quote_id
left join contractor_quotes cq on cq.id = clq.contractor_quote_id
where js.awarded_contractor_id = auth.uid()
  and js.status in ('awarded','contacted','scheduled','in_progress',
                    'completed_by_contractor','completed','paid');
grant select on my_sq_won_jobs to authenticated;
