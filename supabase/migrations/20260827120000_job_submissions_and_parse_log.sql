-- ============================================================================
-- Paid-ads landing page: job submissions + parse pipeline (Part 1).
--
-- /start receives paid ad traffic. A customer describes a job in free text;
-- a server-side pipeline (deterministic extraction + LLM classification +
-- postcode geocode) turns it into a normalised draft record the customer
-- confirms and attaches contact details to. This funnel is separate from the
-- open-access jobs board — nothing here feeds `jobs` automatically.
--
-- Three tables:
--   job_submissions       the record itself (draft at parse, confirmed at
--                         contact capture; raw_text always kept verbatim)
--   job_submission_parses immutable log of every parse attempt — the diff
--                         between this and the confirmed record is the eval
--                         corpus for prompt improvements. Never discard.
--   job_parse_events      per-IP rate-limit counter + rejection/fallback log,
--                         so abuse tuning is done from data, not guesswork.
-- ============================================================================

-- ── job_submissions ─────────────────────────────────────────────────────────
-- service_id is a real FK into services: an out-of-taxonomy value cannot be
-- stored, and null means the model (or the customer) matched nothing — a
-- first-class outcome, not an error. The customer's own words always survive
-- in service_verbatim.
create table if not exists job_submissions (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  confirmed_at         timestamptz,
  status               text not null default 'draft'
                         check (status in ('draft','confirmed','abandoned')),
  raw_text             text not null,                 -- always retained verbatim
  location_raw         text,                          -- as typed
  service_id           int references services(id),   -- null ⇔ unmatched
  service_verbatim     text,                          -- customer's own words
  service_alternatives text[] not null default '{}',  -- canonical names, ranked
  service_confirmed    boolean,                       -- accepted the classification?
  area_value           numeric,
  area_unit            text check (area_unit in ('acres','hectares','sq_m','linear_m')),
  area_source          text not null default 'stated'
                         check (area_source in ('stated')),  -- widened when mapping ships
  postcode             text,
  lat                  numeric,
  lng                  numeric,
  county_id            int references counties(id),   -- from the geocode, never the model
  urgency              text check (urgency in ('asap','within_month','flexible','dated')),
  target_date          date,
  access_notes         text,
  obstacles            text,
  service_attributes   jsonb not null default '{}',
  contact_name         text,
  contact_phone        text,
  contact_email        text,
  contact_preference   text check (contact_preference in ('phone','email','either')),
  parse_confidence     jsonb not null default '{}',   -- per-field 0..1
  missing_fields       text[] not null default '{}',
  model_version        text,
  prompt_version       text,
  parsed_at            timestamptz,
  parse_source         text check (parse_source in ('llm','deterministic_fallback','manual')),
  utm_source           text,
  utm_medium           text,
  utm_campaign         text,
  gclid                text
);
create index if not exists job_submissions_status_idx  on job_submissions (status);
create index if not exists job_submissions_created_idx on job_submissions (created_at);

-- ── job_submission_parses ───────────────────────────────────────────────────
-- One row per parse attempt, raw model output verbatim. Immutable: insert
-- only, never updated, never pruned.
create table if not exists job_submission_parses (
  id                   uuid primary key default gen_random_uuid(),
  submission_id        uuid not null references job_submissions(id),
  model_output         jsonb,                         -- raw tool_use input; null on LLM failure
  deterministic_output jsonb not null default '{}',
  parse_source         text,
  model_version        text,
  prompt_version       text,
  error                text,
  latency_ms           int,
  created_at           timestamptz not null default now()
);
create index if not exists job_submission_parses_submission_idx
  on job_submission_parses (submission_id);

-- ── job_parse_events ────────────────────────────────────────────────────────
-- Doubles as the rate-limit window (count rows per ip in the last hour) and
-- the §8 rejection log (every rejected/degraded attempt, with reason).
create table if not exists job_parse_events (
  id         bigserial primary key,
  ip         text not null,
  action     text not null check (action in ('parse','confirm')),
  outcome    text not null check (outcome in ('ok','rejected','fallback')),
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists job_parse_events_ip_idx on job_parse_events (ip, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- All three hold customer PII / abuse telemetry: RLS on, no policies →
-- service-role only, same as leads.
alter table job_submissions       enable row level security;
alter table job_submission_parses enable row level security;
alter table job_parse_events      enable row level security;
