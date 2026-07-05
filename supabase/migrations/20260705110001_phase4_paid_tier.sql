-- ============================================================================
-- Phase 4 — paid tier: exclusive-window notifications, paid visibility, booked
-- flag (spec §5, §8). Stripe wiring is app-side; the subscriptions table and
-- is_active_subscriber() already exist from Phase 0.
-- ============================================================================

-- ── notify_paid_members(): exclusive-window email (spec §8) ─────────────────
-- On posting a job with a head-start window, email ACTIVE SUBSCRIBERS in the
-- matching counties. Idempotent via job_notifications kind 'exclusive_new'.
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
          'opens_at', r_job.bidding_opens_at, 'closes_at', r_job.bidding_closes_at));
    end if;
  end loop;
end;
$$;
revoke execute on function notify_paid_members(uuid) from public;
grant execute on function notify_paid_members(uuid) to service_role;

-- ── notify_job_open(): exclude active subscribers ───────────────────────────
-- Free-tier "bidding opens" email should NOT go to paid members (they already
-- got the exclusive-window email and have contact access).
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
          'county_id', r_job.county_id, 'closes_at', r_job.bidding_closes_at));
    end if;
  end loop;
end;
$$;
revoke execute on function notify_job_open(uuid) from public;
grant execute on function notify_job_open(uuid) to service_role;

-- ── public_jobs: show exclusive jobs to active subscribers ──────────────────
-- Free tier: open jobs in their counties. Active subscribers additionally see
-- EXCLUSIVE jobs in their counties (the head-start window). Flags let the UI
-- swap the bid panel for a contact panel.
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

-- ── mark_booked(): booked-in-window flag (spec §5, acceptance #14) ──────────
-- A paid member who takes a job during the window flags it. This notifies admin
-- but does NOT change the job status by itself.
create or replace function mark_booked(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_contractor uuid := auth.uid(); v_job record;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;
  if not is_active_subscriber(v_contractor) then
    raise exception 'only paid members can flag a job as booked';
  end if;
  select * into v_job from jobs where id = p_job_id;
  if v_job.id is null then raise exception 'job not found'; end if;

  insert into pending_emails (kind, to_email, payload)
    values ('booked_flag', '__admin__', jsonb_build_object(
      'job_id', p_job_id, 'title', v_job.title, 'contractor_id', v_contractor));
end;
$$;
grant execute on function mark_booked(uuid) to authenticated;
