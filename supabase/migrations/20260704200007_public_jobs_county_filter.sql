-- ============================================================================
-- Correctness fix + contractor "my bids" view.
--
-- 1. public_jobs must only show jobs in the contractor's OWN counties
--    (acceptance #1 — a Wiltshire-only contractor must not see a Hampshire job).
--    The original view showed every open job to any approved contractor.
-- 2. my_bid_jobs: jobs the current contractor has bid on, with outcome, so they
--    can see won/lost/expired state after a job leaves 'open' (and thus
--    public_jobs). No customer PII — the winner gets that via get_job_contact().
-- ============================================================================

create or replace view public_jobs
with (security_invoker = false) as
select
  j.id,
  j.title,
  j.description,
  j.service_ids,
  j.postcode_district,
  j.town,
  j.county_id,
  c.name              as county,
  j.budget_hint,
  j.bidding_closes_at,
  (select count(*) from bids b where b.job_id = j.id) as bid_count
from jobs j
join counties c on c.id = j.county_id
where j.status = 'open'
  and j.consent_to_share = true
  and exists (
    select 1 from contractors ct
    where ct.id = auth.uid() and ct.status = 'approved'
  )
  and j.county_id in (
    select cc.county_id from contractor_counties cc
    where cc.contractor_id = auth.uid()
  );

grant select on public_jobs to authenticated;

create or replace view my_bid_jobs
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
  b.id                         as my_bid_id,
  b.amount_pence               as my_amount_pence,
  b.note                       as my_note,
  (j.awarded_bid_id = b.id)    as won
from bids b
join jobs j on j.id = b.job_id
join counties c on c.id = j.county_id
where b.contractor_id = auth.uid();

grant select on my_bid_jobs to authenticated;
