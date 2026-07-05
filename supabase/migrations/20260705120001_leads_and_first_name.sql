-- ============================================================================
-- Facebook-ads lead intake + public first-name display.
--
-- Leads arrive from Facebook Lead Ads forms (via Zapier/Make/Meta webhook →
-- POST /api/leads) into an approval queue. Admin reviews each lead and either
-- publishes it as a job or dismisses it.
--
-- Privacy split on publish: the job's PUBLIC listing shows the customer's
-- FIRST name only, the postcode district (first letters of the postcode), the
-- job title and details. Surname, phone, email, and the full postcode stay
-- private until award / paid access, as before.
-- ============================================================================

create table if not exists leads (
  id         uuid primary key default gen_random_uuid(),
  source     text not null default 'facebook',
  full_name  text not null,
  phone      text,
  email      text,
  postcode   text,
  job_hint   text,                          -- what the form says they want
  details    jsonb not null default '{}',   -- raw form payload, kept for audit
  status     text not null default 'pending'
               check (status in ('pending','converted','dismissed')),
  job_id     uuid references jobs(id),      -- set when converted
  created_at timestamptz not null default now()
);
create index if not exists leads_status_idx on leads (status);

-- RLS on, no policies → service-role only (admin routes + the intake endpoint).
alter table leads enable row level security;

-- Public-facing first name on jobs. customer_name keeps the FULL name privately.
alter table jobs add column if not exists customer_first_name text;

-- ── Rebuild views to expose the first name ─────────────────────────────────
drop view if exists public_jobs;
create view public_jobs
with (security_invoker = false) as
select
  j.id,
  j.title,
  j.description,
  j.service_ids,
  j.postcode_district,
  j.town,
  j.county_id,
  c.name                                as county,
  j.budget_hint,
  j.bidding_closes_at,
  (j.status = 'exclusive')              as is_exclusive,
  is_active_subscriber(auth.uid())      as paid_access,
  j.customer_first_name,
  (select count(*) from bids b where b.job_id = j.id) as bid_count
from jobs j
join counties c on c.id = j.county_id
where j.consent_to_share = true
  and exists (select 1 from contractors ct where ct.id = auth.uid() and ct.status = 'approved')
  and j.county_id in (select cc.county_id from contractor_counties cc where cc.contractor_id = auth.uid())
  and (
    j.status = 'open'
    or (j.status = 'exclusive' and is_active_subscriber(auth.uid()))
  );
grant select on public_jobs to authenticated;

drop view if exists my_bid_jobs;
create view my_bid_jobs
with (security_invoker = false) as
select
  j.id,
  j.title,
  j.description,
  j.service_ids,
  j.postcode_district,
  j.town,
  j.county_id,
  c.name                       as county,
  j.budget_hint,
  j.status,
  j.bidding_closes_at,
  j.awarded_bid_id,
  j.customer_first_name,
  b.id                         as my_bid_id,
  b.amount_pence               as my_amount_pence,
  b.note                       as my_note,
  (j.awarded_bid_id = b.id)    as won
from bids b
join jobs j on j.id = b.job_id
join counties c on c.id = j.county_id
where b.contractor_id = auth.uid();
grant select on my_bid_jobs to authenticated;
