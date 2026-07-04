-- ============================================================================
-- Core marketplace tables (spec §3).
-- FK delete semantics follow acceptance criterion #10: deleting a contractor
-- cascades their bids + county selections, but contact_reveals uses RESTRICT so
-- audit history can never be silently destroyed (soft-suspend contractors
-- instead of deleting them).
-- ============================================================================

-- Contractors — one row per auth user; profile completed at signup.
create table if not exists contractors (
  id             uuid primary key references auth.users(id) on delete cascade,
  business_name  text not null,
  contact_name   text not null,
  phone          text not null,
  email          text not null,              -- denormalised from auth for admin
  base_postcode  text not null,              -- display/vetting only, NOT matching
  services       int[] not null default '{}',-- FK values into services
  status         text not null default 'pending'
                   check (status in ('pending','approved','suspended')),
  notify_new_jobs boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists contractor_counties (
  contractor_id uuid references contractors(id) on delete cascade,
  county_id     int references counties(id),
  primary key (contractor_id, county_id)
);

-- Jobs — admin-created only at launch.
create table if not exists jobs (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  description            text not null,
  service_ids            int[] not null default '{}',
  postcode               text not null,               -- full postcode, PRIVATE
  postcode_district      text not null,               -- e.g. 'SO23', PUBLIC
  town                   text,                         -- from postcodes.io, PUBLIC
  county_id              int not null references counties(id),
  customer_name          text not null,               -- PRIVATE until reveal
  customer_phone         text not null,               -- PRIVATE until reveal
  customer_email         text,                         -- PRIVATE until reveal
  consent_to_share       boolean not null default false,
  consent_at             timestamptz,
  consent_wording_version text,
  budget_hint            text,                         -- optional, PUBLIC
  status                 text not null default 'exclusive'
                           check (status in ('exclusive','open','awarded','expired','withdrawn','completed')),
  bidding_opens_at       timestamptz not null,         -- created_at + 12h (paid head start)
  bidding_closes_at      timestamptz not null,         -- bidding_opens_at + 24h
  awarded_bid_id         uuid,                          -- set on award
  created_by             uuid not null,                 -- admin user
  created_at             timestamptz not null default now()
);

create index if not exists jobs_status_idx on jobs (status);
create index if not exists jobs_county_idx on jobs (county_id);
create index if not exists jobs_opens_idx on jobs (bidding_opens_at);
create index if not exists jobs_closes_idx on jobs (bidding_closes_at);

-- Bids — one live bid per contractor per job (re-bid = UPDATE via the unique).
create table if not exists bids (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  amount_pence  int not null check (amount_pence > 0),
  note          text,                                   -- optional pitch
  created_at    timestamptz not null default now(),
  unique (job_id, contractor_id)
);
create index if not exists bids_job_idx on bids (job_id);

-- Every disclosure of customer contact details, whatever the route.
create table if not exists contact_reveals (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id),
  contractor_id uuid not null references contractors(id) on delete restrict,
  route         text not null check (route in ('bid_won','paid_access','admin_manual')),
  revealed_at   timestamptz not null default now(),
  unique (job_id, contractor_id)
);

-- Subscriptions (Phase 4, but the table exists day one so gating is stable).
create table if not exists subscriptions (
  contractor_id          uuid primary key references contractors(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'none'
                           check (status in ('none','active','past_due','canceled')),
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

-- Notification idempotency (spec §8 — every send is keyed to avoid duplicates).
create table if not exists job_notifications (
  job_id        uuid references jobs(id) on delete cascade,
  contractor_id uuid references contractors(id) on delete cascade,
  kind          text not null,     -- 'new_job' | 'won' | 'lost' | 'closing_soon'
  sent_at       timestamptz not null default now(),
  primary key (job_id, contractor_id, kind)
);

-- Outbound email queue. State transitions insert here; a scheduled Edge
-- Function drains it via Resend, keeping DB functions free of network calls
-- (spec §4).
create table if not exists pending_emails (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,        -- 'new_job' | 'bid_won' | 'bid_lost' | 'job_expired' | ...
  to_email   text not null,
  payload    jsonb not null default '{}',
  status     text not null default 'pending'
               check (status in ('pending','sent','failed')),
  attempts   int not null default 0,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists pending_emails_status_idx on pending_emails (status);
