-- ============================================================================
-- Remove claiming: jobs are open-access with view tracking.
--
-- A job no longer belongs to the first contractor who claims it. Every approved
-- contractor covering the county sees it, opens it, and gets the customer's
-- details — the customer chooses between whoever gets in touch. We track who
-- opened each job in contact_reveals (route 'opened'), which stays the single
-- audit trail for every disclosure of customer contact details.
--
-- Also: postcode becomes optional on a job. Admin can post with just a county,
-- so postcode / postcode_district / town may now be null.
-- ============================================================================

-- ── contact_reveals: new routes ─────────────────────────────────────────────
-- 'opened'     — contractor opened the job on the board (the new normal route)
-- 'fcfs_claim' — legacy first-come-first-served claims, backfilled below
alter table contact_reveals drop constraint if exists contact_reveals_route_check;
alter table contact_reveals add constraint contact_reveals_route_check
  check (route in ('bid_won','paid_access','admin_manual','opened','fcfs_claim'));

-- Every job view now writes a reveal row, so the old RESTRICT would make any
-- active contractor undeletable. Keep the per-job history but detach it from
-- the contractor on delete (admin UI shows "no longer on record").
alter table contact_reveals alter column contractor_id drop not null;
alter table contact_reveals drop constraint if exists contact_reveals_contractor_id_fkey;
alter table contact_reveals add constraint contact_reveals_contractor_id_fkey
  foreign key (contractor_id) references contractors(id) on delete set null;

-- ── Backfill: preserve who took each claimed job before the columns go ──────
insert into contact_reveals (job_id, contractor_id, route, revealed_at)
select j.id, j.claimed_by, 'fcfs_claim', coalesce(j.claimed_at, now())
from jobs j
where j.claimed_by is not null
on conflict (job_id, contractor_id) do nothing;

-- ── Status: 'claimed' jobs were taken by a contractor → 'completed' ─────────
alter table jobs drop constraint if exists jobs_status_check;
update jobs set status = 'completed' where status = 'claimed';
alter table jobs add constraint jobs_status_check
  check (status in ('exclusive','open','withdrawn','completed'));

-- ── Drop the claim machinery (views on the columns first) ───────────────────
drop view if exists public_jobs;
drop view if exists my_claimed_jobs;
drop view if exists recently_claimed_jobs;
drop function if exists claim_job(uuid);
drop function if exists get_job_contact(uuid);
alter table jobs drop column if exists claimed_by;
alter table jobs drop column if exists claimed_at;

-- ── Postcode optional: county alone is enough to place a job ────────────────
alter table jobs alter column postcode drop not null;
alter table jobs alter column postcode_district drop not null;

-- ── public_jobs: every live job in the contractor's counties ────────────────
-- opened_at is the current contractor's own open time (null = not yet opened),
-- so the board can split "new to you" from "already viewed".
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
  j.created_at,
  (j.status = 'exclusive')              as is_exclusive,
  is_active_subscriber(auth.uid())      as paid_access,
  j.customer_first_name,
  (select cr.revealed_at from contact_reveals cr
    where cr.job_id = j.id and cr.contractor_id = auth.uid()) as opened_at
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

-- ── my_opened_jobs: jobs this contractor has opened ─────────────────────────
-- Once opened, a job stays here whatever its status — the contractor keeps
-- access to details they were already shown. Includes legacy claims.
create view my_opened_jobs
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
  j.customer_first_name,
  cr.revealed_at               as opened_at
from jobs j
join counties c on c.id = j.county_id
join contact_reveals cr on cr.job_id = j.id and cr.contractor_id = auth.uid()
where j.consent_to_share = true;
grant select on my_opened_jobs to authenticated;

-- ── open_job(): record the open and return the customer's contact ───────────
-- Idempotent: the first call logs the open (unique on job_id + contractor_id);
-- later calls just return the contact again — including after the job closes,
-- since the contractor already had the details.
create or replace function open_job(p_job_id uuid)
returns table (customer_name text, customer_phone text, customer_email text)
language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid := auth.uid();
  v_job        record;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;

  select * into v_job from jobs where id = p_job_id;
  if v_job.id is null then raise exception 'job not found'; end if;

  -- Already opened → details stay available regardless of current status.
  if not exists (select 1 from contact_reveals cr
                 where cr.job_id = p_job_id and cr.contractor_id = v_contractor) then
    if not exists (select 1 from contractors where id = v_contractor and status = 'approved') then
      raise exception 'contractor not approved';
    end if;
    if not v_job.consent_to_share then raise exception 'job not available'; end if;
    if not exists (select 1 from contractor_counties cc
                   where cc.contractor_id = v_contractor and cc.county_id = v_job.county_id) then
      raise exception 'job is not in one of your counties';
    end if;
    if v_job.status = 'exclusive' and not is_active_subscriber(v_contractor) then
      raise exception 'This job is in the early-access window — it opens to everyone shortly.';
    end if;
    if v_job.status not in ('open','exclusive') then
      raise exception 'This job is no longer available.';
    end if;

    insert into contact_reveals (job_id, contractor_id, route)
      values (p_job_id, v_contractor, 'opened')
      on conflict (job_id, contractor_id) do nothing;
  end if;

  return query
    select j.customer_name, j.customer_phone, j.customer_email
    from jobs j where j.id = p_job_id;
end;
$$;
revoke execute on function open_job(uuid) from public;
grant execute on function open_job(uuid) to authenticated;

-- ── admin_metrics(): opens instead of claims ────────────────────────────────
create or replace function admin_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_jobs',            (select count(*) from jobs),
    'open_jobs',             (select count(*) from jobs where status = 'open'),
    'completed_jobs',        (select count(*) from jobs where status = 'completed'),
    'withdrawn_jobs',        (select count(*) from jobs where status = 'withdrawn'),
    'job_opens',             (select count(*) from contact_reveals where route in ('opened','fcfs_claim')),
    'contractors_total',     (select count(*) from contractors),
    'contractors_approved',  (select count(*) from contractors where status = 'approved'),
    'contractors_pending',   (select count(*) from contractors where status = 'pending')
  );
$$;
revoke execute on function admin_metrics() from public;
grant execute on function admin_metrics() to service_role;
