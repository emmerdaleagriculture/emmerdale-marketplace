-- ============================================================================
-- Jobs no longer expire: a job stays on the board until a contractor claims it
-- (or admin withdraws it). Also adds a recently-claimed feed so the board shows
-- network activity instead of sitting empty between open jobs.
--
-- bidding_opens_at stays — it still drives the paid head-start window
-- (exclusive → open). bidding_closes_at and everything built on it goes.
-- ============================================================================

-- ── Cron: the tick only opens due jobs now ──────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'marketplace-tick') then
    perform cron.unschedule('marketplace-tick');
  end if;
  perform cron.schedule(
    'marketplace-tick',
    '*/5 * * * *',
    'select open_due_jobs();'
  );
end $$;

drop function if exists close_due_jobs();
drop function if exists notify_closing_soon();

-- ── Bring previously expired jobs back to the board ─────────────────────────
update jobs set status = 'open' where status = 'expired';

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('exclusive','open','claimed','withdrawn','completed'));

-- ── Drop the expiry column (views on it first) ──────────────────────────────
drop view if exists public_jobs;
drop view if exists my_claimed_jobs;
alter table jobs drop column if exists bidding_closes_at;

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
  j.customer_first_name,
  j.claimed_at
from jobs j
join counties c on c.id = j.county_id
where j.claimed_by = auth.uid();
grant select on my_claimed_jobs to authenticated;

-- ── recently_claimed_jobs: network activity for the contractor board ────────
-- Jobs other contractors have already taken, network-wide, so the board never
-- looks dead. Deliberately thin: no description, no customer name, no contact —
-- just enough to show real jobs are moving through the network.
create view recently_claimed_jobs
with (security_invoker = false) as
select
  j.id,
  j.title,
  j.service_ids,
  j.postcode_district,
  j.town,
  j.county_id,
  c.name        as county,
  j.claimed_at
from jobs j
join counties c on c.id = j.county_id
where j.status in ('claimed','completed')
  and j.consent_to_share = true
  and j.claimed_at is not null
  and exists (select 1 from contractors ct where ct.id = auth.uid() and ct.status = 'approved');
grant select on recently_claimed_jobs to authenticated;

-- ── Notify functions: drop the closes_at payload field ──────────────────────
create or replace function notify_paid_members(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  select * into r_job from jobs where id = p_job_id;
  if r_job.id is null then return; end if;

  for r_ct in
    select distinct ct.id, ct.email
    from contractors ct
    join contractor_counties cc on cc.contractor_id = ct.id
    where cc.county_id = r_job.county_id
      and ct.status = 'approved'
      and ct.notify_new_jobs = true
      and is_active_subscriber(ct.id)
  loop
    insert into job_notifications (job_id, contractor_id, kind)
      values (r_job.id, r_ct.id, 'exclusive_new')
      on conflict (job_id, contractor_id, kind) do nothing;
    if found then
      insert into pending_emails (kind, to_email, payload)
        values ('exclusive_new', r_ct.email, jsonb_build_object(
          'job_id', r_job.id, 'title', r_job.title, 'town', r_job.town,
          'postcode_district', r_job.postcode_district, 'county_id', r_job.county_id,
          'opens_at', r_job.bidding_opens_at));
    end if;
  end loop;
end;
$$;

create or replace function notify_job_open(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  select * into r_job from jobs where id = p_job_id;
  if r_job.id is null or r_job.status <> 'open' then return; end if;

  for r_ct in
    select distinct ct.id, ct.email
    from contractors ct
    join contractor_counties cc on cc.contractor_id = ct.id
    where cc.county_id = r_job.county_id
      and ct.status = 'approved'
      and ct.notify_new_jobs = true
      and not is_active_subscriber(ct.id)
  loop
    insert into job_notifications (job_id, contractor_id, kind)
      values (r_job.id, r_ct.id, 'new_job')
      on conflict (job_id, contractor_id, kind) do nothing;
    if found then
      insert into pending_emails (kind, to_email, payload)
        values ('new_job', r_ct.email, jsonb_build_object(
          'job_id', r_job.id, 'contractor_id', r_ct.id,
          'title', r_job.title, 'town', r_job.town,
          'postcode_district', r_job.postcode_district,
          'county_id', r_job.county_id));
    end if;
  end loop;
end;
$$;

-- open_due_jobs() also put closes_at in its 'new_job' payload — rebuild it too,
-- or the cron tick errors on the missing record field after the column drop.
create or replace function open_due_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  for r_job in
    select * from jobs
    where status = 'exclusive' and bidding_opens_at <= now()
    for update skip locked
  loop
    update jobs set status = 'open' where id = r_job.id;

    for r_ct in
      select distinct ct.id, ct.email
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
      where cc.county_id = r_job.county_id
        and ct.status = 'approved'
        and ct.notify_new_jobs = true
    loop
      insert into job_notifications (job_id, contractor_id, kind)
        values (r_job.id, r_ct.id, 'new_job')
        on conflict (job_id, contractor_id, kind) do nothing;
      if found then
        insert into pending_emails (kind, to_email, payload)
          values ('new_job', r_ct.email, jsonb_build_object(
            'job_id', r_job.id, 'contractor_id', r_ct.id,
            'title', r_job.title, 'town', r_job.town,
            'postcode_district', r_job.postcode_district,
            'county_id', r_job.county_id));
      end if;
    end loop;
  end loop;
end;
$$;

-- ── admin_metrics(): no expiry means no expired count and no fill rate ──────
create or replace function admin_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_jobs',            (select count(*) from jobs),
    'open_jobs',             (select count(*) from jobs where status = 'open'),
    'claimed_jobs',          (select count(*) from jobs where status in ('claimed','completed')),
    'withdrawn_jobs',        (select count(*) from jobs where status = 'withdrawn'),
    'contractors_total',     (select count(*) from contractors),
    'contractors_approved',  (select count(*) from contractors where status = 'approved'),
    'contractors_pending',   (select count(*) from contractors where status = 'pending')
  );
$$;
revoke execute on function admin_metrics() from public;
grant execute on function admin_metrics() to service_role;
