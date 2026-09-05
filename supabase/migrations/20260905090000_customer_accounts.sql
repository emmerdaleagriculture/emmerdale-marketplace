-- ============================================================================
-- Accounts for customers, repeat orders, and repeating schedules.
--
-- Until now an account meant a contractor: /signup says "For contractors",
-- /account reads the contractors table, and a customer reached their job
-- through a tokenised link with no login at all. That is fine for one job and
-- useless for the second one.
--
-- HOW A JOB BECOMES YOURS. Not by matching contact_email: this project runs
-- with mailer_autoconfirm on, so signing up proves nothing about the address,
-- and matching on it would hand anyone another customer's job history by
-- typing their email. An account is created FROM a job page instead — holding
-- the client link is the proof, exactly as it already is for reading the job.
-- Once one job is claimed that way, the rest of that email's jobs follow: the
-- token was emailed to that address, so possession of it is evidence of
-- controlling the inbox it went to.
-- ============================================================================

create table if not exists customers (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  contact_name text,
  phone        text,
  created_at   timestamptz not null default now()
);

alter table customers enable row level security;

create policy customers_select_own on customers for select using (id = auth.uid());
create policy customers_update_own on customers for update using (id = auth.uid());

alter table job_submissions add column if not exists customer_id uuid references customers(id);
create index if not exists job_submissions_customer_idx on job_submissions (customer_id);

-- Read-only, and only your own. Everything that writes here still goes through
-- the service role; this is defence in depth for the customer's own pages.
drop policy if exists job_submissions_select_own on job_submissions;
create policy job_submissions_select_own on job_submissions
  for select using (customer_id is not null and customer_id = auth.uid());

-- ── Repeating schedules ─────────────────────────────────────────────────────
-- Land work comes round again: topping, hedge cutting, harrowing. The customer
-- sets a cadence once and the job re-sends itself until they stop it.
create table if not exists job_schedules (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customers(id) on delete cascade,
  source_submission_id uuid not null references job_submissions(id) on delete cascade,
  interval_months      int  not null check (interval_months between 1 and 24),
  next_run_at          timestamptz not null,
  last_run_at          timestamptz,
  runs                 int  not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

create index if not exists job_schedules_due_idx on job_schedules (next_run_at) where active;
create index if not exists job_schedules_customer_idx on job_schedules (customer_id);

alter table job_schedules enable row level security;
create policy job_schedules_select_own on job_schedules for select using (customer_id = auth.uid());
create policy job_schedules_update_own on job_schedules for update using (customer_id = auth.uid());

-- ── Claiming ────────────────────────────────────────────────────────────────
create or replace function claim_submission_for_customer(p_token text, p_customer_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_also  int := 0;
begin
  select * into v_js from job_submissions
   where client_token = p_token and client_token_revoked_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.customer_id is not null and v_js.customer_id <> p_customer_id then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update job_submissions set customer_id = p_customer_id where id = v_js.id;

  -- The token reached that inbox, so the inbox's other jobs come with it.
  if v_js.contact_email is not null then
    update job_submissions
       set customer_id = p_customer_id
     where customer_id is null
       and lower(contact_email) = lower(v_js.contact_email);
    get diagnostics v_also = row_count;
  end if;

  return jsonb_build_object('ok', true, 'also_claimed', v_also);
end;
$$;

revoke execute on function claim_submission_for_customer(text, uuid) from public, anon, authenticated;
grant execute on function claim_submission_for_customer(text, uuid) to service_role;

-- ── The scheduler ───────────────────────────────────────────────────────────
-- Clones the source job into a fresh confirmed submission and lets the normal
-- distribution path take it from there, so a repeat is indistinguishable from
-- a job posted by hand — same matching, same emails, same portal link.
create or replace function run_due_job_schedules() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r      record;
  v_new  uuid;
  v_done int := 0;
begin
  for r in
    select s.*, js.id as src
      from job_schedules s
      join job_submissions js on js.id = s.source_submission_id
     where s.active and s.next_run_at <= now()
     for update of s skip locked
  loop
    insert into job_submissions (
      status, confirmed_at, customer_id, client_token,
      raw_text, location_raw, service_id, service_verbatim, service_confirmed,
      area_value, area_unit, area_source, area_mapped_value, boundary,
      postcode, lat, lng, county_id,
      urgency, target_date, access_notes, obstacles, service_attributes,
      gate_w3w, gate_width, photo_paths,
      contact_name, contact_phone, contact_email, contact_preference
    )
    select
      'confirmed', now(), r.customer_id, sq_token(),
      raw_text, location_raw, service_id, service_verbatim, service_confirmed,
      area_value, area_unit, area_source, area_mapped_value, boundary,
      postcode, lat, lng, county_id,
      -- A target date from last time is in the past and would read as overdue.
      urgency, null, access_notes, obstacles, service_attributes,
      gate_w3w, gate_width, photo_paths,
      contact_name, contact_phone, contact_email, contact_preference
      from job_submissions where id = r.src
    returning id into v_new;

    perform log_job_event(v_new, 'status_change', null, 'confirmed', 'system', null,
      'repeat schedule', jsonb_build_object('schedule_id', r.id, 'source', r.src));
    perform distribute_submission(v_new);

    update job_schedules
       set last_run_at = now(),
           runs = runs + 1,
           next_run_at = now() + make_interval(months => r.interval_months)
     where id = r.id;

    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

revoke execute on function run_due_job_schedules() from public, anon, authenticated;
grant execute on function run_due_job_schedules() to service_role;

-- Hourly is plenty for something measured in months, and keeps it well clear
-- of the five-minute tick that runs the live job lifecycle.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'job-schedules') then
    perform cron.unschedule('job-schedules');
  end if;
  perform cron.schedule('job-schedules', '9 * * * *', $sch$select run_due_job_schedules();$sch$);
end $$;
