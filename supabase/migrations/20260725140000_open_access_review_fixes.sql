-- ============================================================================
-- Review fixes for the open-access switch.
--
-- 1. Notify emails: include the county name in job payloads. County-only jobs
--    (the new no-postcode path) have null town/postcode_district, which left
--    the "new job in your area" email with no location at all.
-- 2. open_job(): lock the job row on the first open so the status check can't
--    race an admin close/withdraw into logging a reveal on a closed job.
-- 3. admin_metrics.job_opens: count every contact_reveals row, matching the
--    per-job "Opened by" lists in admin (legacy bid_won/paid_access/
--    admin_manual reveals are contact disclosures too).
-- ============================================================================

-- ── Notify functions: add 'county' to the email payloads ────────────────────
create or replace function notify_paid_members(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; v_county text; r_ct record;
begin
  select * into r_job from jobs where id = p_job_id;
  if r_job.id is null then return; end if;
  select name into v_county from counties where id = r_job.county_id;

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
          'county', v_county, 'opens_at', r_job.bidding_opens_at));
    end if;
  end loop;
end;
$$;

create or replace function notify_job_open(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; v_county text; r_ct record;
begin
  select * into r_job from jobs where id = p_job_id;
  if r_job.id is null or r_job.status <> 'open' then return; end if;
  select name into v_county from counties where id = r_job.county_id;

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
          'county_id', r_job.county_id, 'county', v_county));
    end if;
  end loop;
end;
$$;

create or replace function open_due_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; v_county text; r_ct record;
begin
  for r_job in
    select * from jobs
    where status = 'exclusive' and bidding_opens_at <= now()
    for update skip locked
  loop
    update jobs set status = 'open' where id = r_job.id;
    select name into v_county from counties where id = r_job.county_id;

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
            'county_id', r_job.county_id, 'county', v_county));
      end if;
    end loop;
  end loop;
end;
$$;

-- ── open_job(): row lock on the first open ──────────────────────────────────
create or replace function open_job(p_job_id uuid)
returns table (customer_name text, customer_phone text, customer_email text)
language plpgsql security definer set search_path = public as $$
declare
  v_contractor uuid := auth.uid();
  v_job        record;
begin
  if v_contractor is null then raise exception 'not authenticated'; end if;

  -- Lock the row: a first open must not race an admin close/withdraw past the
  -- status check below.
  select * into v_job from jobs where id = p_job_id for update;
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

-- ── admin_metrics(): job_opens counts every reveal, like the admin pages ────
create or replace function admin_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_jobs',            (select count(*) from jobs),
    'open_jobs',             (select count(*) from jobs where status = 'open'),
    'completed_jobs',        (select count(*) from jobs where status = 'completed'),
    'withdrawn_jobs',        (select count(*) from jobs where status = 'withdrawn'),
    'job_opens',             (select count(*) from contact_reveals),
    'contractors_total',     (select count(*) from contractors),
    'contractors_approved',  (select count(*) from contractors where status = 'approved'),
    'contractors_pending',   (select count(*) from contractors where status = 'pending')
  );
$$;
revoke execute on function admin_metrics() from public;
grant execute on function admin_metrics() to service_role;
