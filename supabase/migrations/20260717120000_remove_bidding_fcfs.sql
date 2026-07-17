-- ============================================================================
-- Remove bidding; move the job lifecycle to first-come-first-served claiming.
--
-- Contractors no longer submit a price. A matched contractor claims a job and
-- the first claim wins it outright, revealing the customer's contact. Paid
-- members keep their head-start: they can claim during the exclusive window
-- before the job opens to everyone.
--
-- The internal timing columns (bidding_opens_at / bidding_closes_at) keep their
-- names to limit churn — they mean "opens to all at" and "expires (if unclaimed)
-- at". No user-facing surface references bidding any more.
-- ============================================================================

-- ── Claim columns ───────────────────────────────────────────────────────────
alter table jobs add column if not exists claimed_by uuid references contractors(id) on delete set null;
alter table jobs add column if not exists claimed_at timestamptz;

-- ── Drop the bidding views + functions ──────────────────────────────────────
drop view if exists my_bid_jobs;
drop view if exists public_jobs;
drop function if exists place_bid(uuid, int, text);
drop function if exists award_job(uuid, uuid);
drop function if exists mark_booked(uuid);

-- ── Status: rename 'awarded' → 'claimed' ────────────────────────────────────
-- Find and drop whatever the status check constraint is currently named, then
-- re-add it with 'claimed' in place of 'awarded'.
do $$
declare cn text;
begin
  update jobs set status = 'claimed' where status = 'awarded';
  for cn in
    select conname from pg_constraint
    where conrelid = 'jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table jobs drop constraint %I', cn);
  end loop;
  alter table jobs add constraint jobs_status_check
    check (status in ('exclusive','open','claimed','expired','withdrawn','completed'));
end $$;

-- ── Drop the bids table (cascades its RLS policy, indexes, FKs) ──────────────
drop table if exists bids cascade;

-- Now nothing references the old awarded-bid pointer.
alter table jobs drop column if exists awarded_bid_id;

-- ── public_jobs: claimable jobs in the contractor's counties (no bid count) ──
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
  j.customer_first_name
from jobs j
join counties c on c.id = j.county_id
where j.consent_to_share = true
  and j.claimed_by is null
  and exists (select 1 from contractors ct where ct.id = auth.uid() and ct.status = 'approved')
  and j.county_id in (select cc.county_id from contractor_counties cc where cc.contractor_id = auth.uid())
  and (
    j.status = 'open'
    or (j.status = 'exclusive' and is_active_subscriber(auth.uid()))
  );
grant select on public_jobs to authenticated;

-- ── my_claimed_jobs: jobs the current contractor has claimed ────────────────
create view my_claimed_jobs
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
  j.customer_first_name,
  j.claimed_at
from jobs j
join counties c on c.id = j.county_id
where j.claimed_by = auth.uid();
grant select on my_claimed_jobs to authenticated;

-- ── get_job_contact: only the claimant sees the customer's details ──────────
create or replace function get_job_contact(p_job_id uuid)
returns table (customer_name text, customer_phone text, customer_email text)
language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid := auth.uid();
  v_job        record;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;

  select * into v_job from jobs where id = p_job_id;
  if v_job.id is null then raise exception 'job not found'; end if;
  if v_job.claimed_by is distinct from v_contractor then
    raise exception 'no access to contact details for this job';
  end if;

  return query
    select j.customer_name, j.customer_phone, j.customer_email
    from jobs j where j.id = p_job_id;
end;
$$;

-- ── claim_job(): atomic first-come-first-served claim ───────────────────────
-- Approved contractor, in one of their counties, job consented and unclaimed.
-- Paid members may claim during the exclusive head-start; everyone else once
-- the job is open. The conditional UPDATE is the race guard: only the first
-- caller flips claimed_by from null, so exactly one contractor wins.
create or replace function claim_job(p_job_id uuid)
returns table (customer_name text, customer_phone text, customer_email text)
language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid := auth.uid();
  v_job        record;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from contractors where id = v_contractor and status = 'approved') then
    raise exception 'contractor not approved';
  end if;

  select * into v_job from jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'job not found'; end if;
  if not v_job.consent_to_share then raise exception 'job not available'; end if;
  if not exists (select 1 from contractor_counties cc
                 where cc.contractor_id = v_contractor and cc.county_id = v_job.county_id) then
    raise exception 'job is not in one of your counties';
  end if;

  if v_job.claimed_by is not null or v_job.status = 'claimed' then
    raise exception 'This job has already been taken.';
  end if;
  if v_job.status = 'exclusive' and not is_active_subscriber(v_contractor) then
    raise exception 'This job is in the paid early-access window — it opens to everyone shortly.';
  end if;
  if v_job.status not in ('open','exclusive') then
    raise exception 'This job is no longer available.';
  end if;

  update jobs
    set status = 'claimed', claimed_by = v_contractor, claimed_at = now()
    where id = p_job_id and claimed_by is null and status in ('open','exclusive');
  if not found then raise exception 'This job has already been taken.'; end if;

  return query
    select j.customer_name, j.customer_phone, j.customer_email
    from jobs j where j.id = p_job_id;
end;
$$;
revoke execute on function claim_job(uuid) from public;
grant execute on function claim_job(uuid) to authenticated;

-- ── close_due_jobs(): expire unclaimed open jobs at their deadline ──────────
create or replace function close_due_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record;
begin
  for r_job in
    select * from jobs
    where status = 'open' and claimed_by is null and bidding_closes_at <= now()
    for update skip locked
  loop
    update jobs set status = 'expired' where id = r_job.id;
    insert into pending_emails (kind, to_email, payload)
      values ('job_expired', '__admin__',
              jsonb_build_object('job_id', r_job.id, 'title', r_job.title));
  end loop;
end;
$$;

-- ── notify_closing_soon(): nudge matched contractors on unclaimed jobs ──────
create or replace function notify_closing_soon()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  for r_job in
    select * from jobs
    where status = 'open' and claimed_by is null
      and bidding_closes_at <= now() + interval '4 hours'
      and bidding_closes_at > now()
  loop
    for r_ct in
      select distinct ct.id, ct.email
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
      where cc.county_id = r_job.county_id
        and ct.status = 'approved'
        and ct.notify_new_jobs = true
    loop
      insert into job_notifications (job_id, contractor_id, kind)
        values (r_job.id, r_ct.id, 'closing_soon')
        on conflict (job_id, contractor_id, kind) do nothing;
      if found then
        insert into pending_emails (kind, to_email, payload)
          values ('closing_soon', r_ct.email, jsonb_build_object(
            'job_id', r_job.id, 'title', r_job.title, 'town', r_job.town,
            'postcode_district', r_job.postcode_district, 'closes_at', r_job.bidding_closes_at));
      end if;
    end loop;
  end loop;
end;
$$;

-- ── admin_metrics(): drop bid stats; count claimed instead of awarded ───────
create or replace function admin_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_jobs',            (select count(*) from jobs),
    'open_jobs',             (select count(*) from jobs where status = 'open'),
    'claimed_jobs',          (select count(*) from jobs where status in ('claimed','completed')),
    'expired_jobs',          (select count(*) from jobs where status = 'expired'),
    'withdrawn_jobs',        (select count(*) from jobs where status = 'withdrawn'),
    'contractors_total',     (select count(*) from contractors),
    'contractors_approved',  (select count(*) from contractors where status = 'approved'),
    'contractors_pending',   (select count(*) from contractors where status = 'pending'),
    'fill_rate', (
      select case when (a + e) = 0 then null else round(a::numeric / (a + e), 3) end
      from (select
        (select count(*) from jobs where status in ('claimed','completed')) a,
        (select count(*) from jobs where status = 'expired') e) x)
  );
$$;
revoke execute on function admin_metrics() from public;
grant execute on function admin_metrics() to service_role;
