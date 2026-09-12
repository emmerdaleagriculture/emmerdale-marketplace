-- ============================================================================
-- Repeat jobs: book the same contractor again, or test the market.
--
-- A repeat — "Order it again" or a job_schedules run — always went to every
-- contractor covering the county. A customer happy with last time had no way
-- to simply ask for them again, and the contractor who earned the repeat
-- competed for it from scratch.
--
-- Now a repeat carries a choice:
--
--   market  as before: every approved, vetted contractor covering the county.
--   same    only the contractor who did it last time is invited, told it is a
--           repeat and what they priced before. They have
--           sq_direct_window_hours (48) to price or pass. If they pass, run out
--           of time, or are no longer approved, the job opens to the market
--           automatically and the customer is told. The customer can open it
--           to the market themselves at any point from their job page.
--
-- job_submissions gains repeat_of (the job it copies), preferred_contractor_id
-- and market_opens_at (non-null only while the job is offered to one
-- contractor). job_schedules gains contractor_mode and contractor_id.
--
-- Invitations now go through one function, sq_invite_contractor, so the
-- row + event + opt-out-respecting email is written once rather than in three
-- copies (distribution, late invite, opening to the market).
-- ============================================================================

alter table job_submissions
  add column if not exists repeat_of uuid references job_submissions(id) on delete set null,
  add column if not exists preferred_contractor_id uuid references contractors(id) on delete set null,
  add column if not exists market_opens_at timestamptz;

create index if not exists job_submissions_market_opens_idx
  on job_submissions (market_opens_at) where market_opens_at is not null;

alter table job_schedules
  add column if not exists contractor_mode text not null default 'market',
  add column if not exists contractor_id uuid references contractors(id) on delete set null;
alter table job_schedules drop constraint if exists job_schedules_contractor_mode_check;
alter table job_schedules add constraint job_schedules_contractor_mode_check
  check (contractor_mode in ('market', 'same'));

insert into app_config (key, value) values ('sq_direct_window_hours', '48')
on conflict (key) do nothing;

-- ── One invitation ──────────────────────────────────────────────────────────
-- Row, 'sent' event, and the email unless the contractor has opted out. False
-- when they were already invited. p_extra rides on both the event metadata and
-- the email payload (late_join, direct, last_price_pence, …).
create or replace function sq_invite_contractor(
  p_submission_id uuid, p_contractor_id uuid, p_extra jsonb default '{}'::jsonb
) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js  job_submissions%rowtype;
  v_ct  contractors%rowtype;
  v_inv job_invitations%rowtype;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  select * into v_ct from contractors where id = p_contractor_id;
  if v_js.id is null or v_ct.id is null then return false; end if;

  insert into job_invitations (submission_id, contractor_id, token, distance_miles)
  values (v_js.id, v_ct.id, sq_token(),
          round(haversine_miles(v_js.lat, v_js.lng, v_ct.base_lat, v_ct.base_lng), 1))
  on conflict (submission_id, contractor_id) do nothing
  returning * into v_inv;
  if not found then return false; end if;

  insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
  values (v_inv.id, v_ct.id, 'sent', coalesce(p_extra, '{}'::jsonb));

  if v_ct.notify_new_jobs then
    perform sq_notify_once(v_js.id, v_ct.id::text, 'sq_invitation', v_ct.email,
      sq_job_facts(v_js.id)
        || jsonb_build_object('token', v_inv.token, 'distance_miles', v_inv.distance_miles)
        || coalesce(p_extra, '{}'::jsonb));
  end if;
  return true;
end;
$$;

revoke execute on function sq_invite_contractor(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function sq_invite_contractor(uuid, uuid, jsonb) to service_role;

-- ── Distribution ────────────────────────────────────────────────────────────
create or replace function distribute_submission(p_submission_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js         job_submissions%rowtype;
  v_allowlist  jsonb;
  v_match      record;
  v_invited    int := 0;
  v_direct     contractors%rowtype;
  v_opens      timestamptz;
  v_last_price int;
  v_last_at    timestamptz;
  v_unavailable boolean := false;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status <> 'confirmed' then
    return jsonb_build_object('ok', true, 'skipped', true, 'status', v_js.status);
  end if;

  if v_js.client_token is null then
    update job_submissions set client_token = sq_token() where id = v_js.id
      returning client_token into v_js.client_token;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  -- Same contractor: offered to them alone, if they are still someone we send
  -- work to. County coverage is not re-checked — they did this job before.
  if v_js.preferred_contractor_id is not null then
    select ct.* into v_direct
      from contractors ct
     where ct.id = v_js.preferred_contractor_id
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)));

    if v_direct.id is null then
      v_unavailable := true;
      update job_submissions set preferred_contractor_id = null where id = v_js.id;
    else
      v_opens := now() + make_interval(hours => app_config_num('sq_direct_window_hours', 48)::int);
      select cq.contractor_price_pence, prev.awarded_at
        into v_last_price, v_last_at
        from job_submissions prev
        join client_quotes clq    on clq.id = prev.accepted_client_quote_id
        join contractor_quotes cq on cq.id = clq.contractor_quote_id
       where prev.id = v_js.repeat_of
         and prev.awarded_contractor_id = v_direct.id;
      perform sq_invite_contractor(v_js.id, v_direct.id, jsonb_build_object(
        'direct', true,
        'market_opens_at', v_opens,
        'last_price_pence', v_last_price,
        'last_job_at', v_last_at));
      v_invited := 1;
    end if;
  end if;

  if v_direct.id is null then
    for v_match in
      select ct.id
        from contractors ct
        join contractor_counties cc on cc.contractor_id = ct.id
       where cc.county_id = v_js.county_id
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and (jsonb_array_length(v_allowlist) = 0
              or ct.email in (select jsonb_array_elements_text(v_allowlist)))
    loop
      if sq_invite_contractor(v_js.id, v_match.id) then
        v_invited := v_invited + 1;
      end if;
    end loop;
  end if;

  if v_invited = 0 then
    update job_submissions set status = 'no_matches' where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'confirmed', 'no_matches', 'system', null, null,
      jsonb_build_object('county_id', v_js.county_id, 'service_id', v_js.service_id));
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_no_matches',
      v_js.contact_email, sq_job_facts(v_js.id) || jsonb_build_object('contact_name', v_js.contact_name));
    perform sq_notify_once(v_js.id, '__admin__', 'sq_no_matches', '__admin__',
      sq_job_facts(v_js.id) || jsonb_build_object('supply_gap', true));
    return jsonb_build_object('ok', true, 'invited', 0, 'status', 'no_matches');
  end if;

  update job_submissions
     set status = 'distributed',
         distributed_at = now(),
         expires_at = now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int),
         market_opens_at = v_opens
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited, 'direct_contractor_id', v_direct.id,
                       'direct_unavailable', v_unavailable));

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
      'direct_contractor', v_direct.business_name, 'market_opens_at', v_opens,
      'direct_unavailable', v_unavailable));

  return jsonb_build_object('ok', true, 'invited', v_invited, 'direct', v_direct.id is not null);
end;
$$;

-- ── Opening a job to the market ─────────────────────────────────────────────
-- p_reason: 'customer' (they asked — no email, they're on the page),
-- 'declined' or 'timeout' (the customer is told). Other contractors get the
-- full expiry window from now, and distributed_at restarts so the 48h
-- "no prices yet" alert measures the market, not the direct offer.
create or replace function open_submission_to_market(
  p_submission_id uuid, p_reason text default 'customer'
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_match     record;
  v_invited   int := 0;
  v_name      text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.market_opens_at is null then return jsonb_build_object('ok', false, 'reason', 'not_direct'); end if;
  if v_js.status not in ('distributed', 'quotes_receiving') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for v_match in
    select ct.id
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
     where cc.county_id = v_js.county_id
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
  loop
    if sq_invite_contractor(v_js.id, v_match.id, jsonb_build_object('opened_to_market', p_reason)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  update job_submissions
     set market_opens_at = null,
         distributed_at = now(),
         expires_at = greatest(expires_at,
           now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
   where id = v_js.id;

  if p_reason in ('declined', 'timeout') then
    select business_name into v_name from contractors where id = v_js.preferred_contractor_id;
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_direct_fallback',
      v_js.contact_email, jsonb_build_object(
        'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
        'contractor_name', v_name, 'reason', p_reason, 'invited', v_invited));
  end if;

  return jsonb_build_object('ok', true, 'invited', v_invited);
end;
$$;

revoke execute on function open_submission_to_market(uuid, text) from public, anon, authenticated;
grant execute on function open_submission_to_market(uuid, text) to service_role;

-- ── The direct-offer clock ──────────────────────────────────────────────────
-- A job offered to one contractor opens to the market when they pass, or when
-- the window closes without their price. One who has priced keeps it: the
-- customer asked for them and has their price — opening it is their call.
create or replace function sq_direct_window_tick() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r     record;
  v_n   int := 0;
begin
  for r in
    select js.id,
           exists (select 1 from job_invitations ji
                    where ji.submission_id = js.id
                      and ji.contractor_id = js.preferred_contractor_id
                      and ji.status = 'declined') as declined
      from job_submissions js
     where js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and not exists (select 1 from contractor_quotes q
                        where q.submission_id = js.id
                          and q.contractor_id = js.preferred_contractor_id
                          and q.confirmed_by_contractor)
       and (js.market_opens_at <= now()
            or js.preferred_contractor_id is null
            or exists (select 1 from job_invitations ji
                        where ji.submission_id = js.id
                          and ji.contractor_id = js.preferred_contractor_id
                          and ji.status = 'declined'))
     for update of js skip locked
  loop
    perform open_submission_to_market(r.id, case when r.declined then 'declined' else 'timeout' end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function sq_direct_window_tick() from public, anon, authenticated;
grant execute on function sq_direct_window_tick() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'direct-window-tick') then
    perform cron.unschedule('direct-window-tick');
  end if;
  perform cron.schedule('direct-window-tick', '*/5 * * * *', $c$select sq_direct_window_tick();$c$);
end $$;

-- ── Late invites skip jobs offered to one contractor ───────────────────────
create or replace function invite_contractor_to_open_jobs(
  p_contractor_id uuid, p_county_id int default null
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ct        contractors%rowtype;
  v_allowlist jsonb;
  v_js        record;
  v_invited   int := 0;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found or v_ct.status <> 'approved' or v_ct.vetted_at is null then
    return 0;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);
  if jsonb_array_length(v_allowlist) > 0
     and v_ct.email not in (select jsonb_array_elements_text(v_allowlist)) then
    return 0;
  end if;

  for v_js in
    select js.id
      from job_submissions js
      join contractor_counties cc
        on cc.county_id = js.county_id and cc.contractor_id = v_ct.id
     where js.status in ('distributed', 'quotes_receiving')
       and js.market_opens_at is null
       and js.expires_at > now() + make_interval(hours => app_config_num('sq_late_invite_min_hours', 12)::int)
       and (p_county_id is null or js.county_id = p_county_id)
     order by js.expires_at
       for share of js skip locked
  loop
    if sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object('late_join', true)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  return v_invited;
end;
$$;

revoke execute on function invite_contractor_to_open_jobs(uuid, int) from public;
grant execute on function invite_contractor_to_open_jobs(uuid, int) to service_role;

-- ── Schedules carry the choice ──────────────────────────────────────────────
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
    begin
      insert into job_submissions (
        status, confirmed_at, customer_id, client_token,
        repeat_of, preferred_contractor_id,
        raw_text, location_raw, service_id, service_verbatim, service_confirmed,
        area_value, area_unit, area_source, area_mapped_value, boundary,
        postcode, lat, lng, county_id,
        urgency, target_date, access_notes, obstacles, service_attributes,
        gate_w3w, gate_width, photo_paths,
        contact_name, contact_phone, contact_email, contact_preference
      )
      select
        'confirmed', now(), r.customer_id, sq_token(),
        r.src, case when r.contractor_mode = 'same' then r.contractor_id end,
        raw_text, location_raw, service_id, service_verbatim, service_confirmed,
        area_value, area_unit, area_source, area_mapped_value, boundary,
        postcode, lat, lng, county_id,
        urgency, null, access_notes, obstacles, service_attributes,
        gate_w3w, gate_width, photo_paths,
        contact_name, contact_phone, contact_email, contact_preference
        from job_submissions where id = r.src
      returning id into v_new;

      perform log_job_event(v_new, 'status_change', null, 'confirmed', 'system', null,
        'repeat schedule', jsonb_build_object('schedule_id', r.id, 'source', r.src,
                                              'contractor_mode', r.contractor_mode));
      perform distribute_submission(v_new);
      v_done := v_done + 1;
    exception when others then
      raise warning 'job schedule % failed: %', r.id, sqlerrm;
    end;

    update job_schedules
       set last_run_at = now(),
           runs = runs + 1,
           next_run_at = now() + make_interval(months => r.interval_months)
     where id = r.id;
  end loop;
  return v_done;
end;
$$;

revoke execute on function run_due_job_schedules() from public, anon, authenticated;
grant execute on function run_due_job_schedules() to service_role;
