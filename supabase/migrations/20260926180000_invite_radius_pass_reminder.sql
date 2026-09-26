-- Fewer, nearer invitations — and a way to say no without opening the job.
--
-- Three weeks of sealed-quote invitations (648 sent, 240 opened) said where
-- the missing opens went. Distribution invited every approved contractor who
-- had ticked the job's county, and distance was "computed for display only".
-- A third of all invitations went to contractors 50+ miles from the job, and
-- those opened at half the rate of the rest. Four contractors who had ticked
-- 48–88 counties received 114 invitations between them and opened 10. Strip
-- them out and the open rate is 43%; cap by distance and it is 45%.
--
-- The invitation email also carried the whole spec, so a contractor who read
-- it and thought "not for me" had nothing to click — and a deliberate no was
-- indistinguishable from an unread email: 33 passes ever recorded against
-- 240 opens. And opens were front-loaded (132 of 240 inside the hour, nearly
-- all inside a day) with no follow-up at all.
--
-- So, in order of expected effect:
--   1. a radius: nobody is invited to a job further than sq_invite_radius_miles
--      from their base (40 to start; direct offers to a named contractor and
--      the first-refusal contractor are not distance-checked — they were asked
--      for by name, or have their own county deal);
--   2. a one-tap pass link in the email, with an undo, so silence turns into
--      a recorded pass;
--   3. one reminder, a day later, to whoever has not opened a job that is
--      still short of prices.
-- The "flag contractors covering 30+ counties" half lives in the admin page.

-- ── Config ─────────────────────────────────────────────────────────────────
insert into app_config (key, value) values
  ('sq_invite_radius_miles', '40'),
  -- The reminder goes out once the invitation is this old and still unopened…
  ('sq_invite_reminder_hours', '24'),
  -- …but only while the job has fewer than this many confirmed prices. A job
  -- with three prices does not need chasing; the customer has a choice.
  ('sq_invite_reminder_max_prices', '3')
on conflict (key) do nothing;

-- ── Is this contractor near enough to be invited? ──────────────────────────
--
-- Unknown is not "no": a county-only enquiry (the portal publishes no
-- postcode) and a contractor whose base never geocoded both come back true,
-- so the radius only ever removes invitations it can measure. There is one
-- such contractor today.
create or replace function sq_in_invite_range(
  p_job_lat numeric, p_job_lng numeric,
  p_ct_lat numeric,  p_ct_lng numeric
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_job_lat is null or p_job_lng is null or p_ct_lat is null or p_ct_lng is null then true
    else haversine_miles(p_job_lat, p_job_lng, p_ct_lat, p_ct_lng)
           <= app_config_num('sq_invite_radius_miles', 40)
  end;
$$;

-- ── distribute_submission: the market loop gains the radius ────────────────
-- Everything above the market loop is as before. The skipped count goes into
-- the distribution event so a thin field can be told apart from a thin county.
create or replace function distribute_submission(p_submission_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js         job_submissions%rowtype;
  v_allowlist  jsonb;
  v_match      record;
  v_invited    int := 0;
  v_too_far    int := 0;
  v_direct     contractors%rowtype;
  v_opens      timestamptz;
  v_last_price int;
  v_last_at    timestamptz;
  v_unavailable boolean := false;
  v_fr_id      text;
  v_first      boolean := false;
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

  -- First refusal: a new (non-repeat) job in the contractor's counties.
  elsif v_js.repeat_of is null then
    v_fr_id := (select value #>> '{}' from app_config where key = 'sq_first_refusal_contractor_id');
    if v_fr_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select ct.* into v_direct
        from contractors ct
        join contractor_counties cc
          on cc.contractor_id = ct.id and cc.county_id = v_js.county_id
       where ct.id = v_fr_id::uuid
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and (jsonb_array_length(v_allowlist) = 0
              or ct.email in (select jsonb_array_elements_text(v_allowlist)));

      if v_direct.id is not null then
        v_first := true;
        v_opens := now() + make_interval(hours => app_config_num('sq_first_refusal_window_hours', 24)::int);
        update job_submissions
           set preferred_contractor_id = v_direct.id, first_refusal = true
         where id = v_js.id;
        perform sq_invite_contractor(v_js.id, v_direct.id, jsonb_build_object(
          'direct', true,
          'first_refusal', true,
          'market_opens_at', v_opens));
        v_invited := 1;
      end if;
    end if;
  end if;

  if v_direct.id is null then
    for v_match in
      select ct.id,
             sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng) as near
        from contractors ct
        join contractor_counties cc on cc.contractor_id = ct.id
       where cc.county_id = v_js.county_id
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and (jsonb_array_length(v_allowlist) = 0
              or ct.email in (select jsonb_array_elements_text(v_allowlist)))
    loop
      if not v_match.near then
        v_too_far := v_too_far + 1;
      elsif sq_invite_contractor(v_js.id, v_match.id) then
        v_invited := v_invited + 1;
      end if;
    end loop;
  end if;

  if v_invited = 0 then
    update job_submissions set status = 'no_matches' where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'confirmed', 'no_matches', 'system', null, null,
      jsonb_build_object('county_id', v_js.county_id, 'service_id', v_js.service_id,
                         'too_far', v_too_far));
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_no_matches',
      v_js.contact_email, sq_job_facts(v_js.id) || jsonb_build_object('contact_name', v_js.contact_name));
    perform sq_notify_once(v_js.id, '__admin__', 'sq_no_matches', '__admin__',
      sq_job_facts(v_js.id) || jsonb_build_object('supply_gap', true, 'too_far', v_too_far));
    return jsonb_build_object('ok', true, 'invited', 0, 'status', 'no_matches', 'too_far', v_too_far);
  end if;

  update job_submissions
     set status = 'distributed',
         distributed_at = now(),
         expires_at = now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int),
         market_opens_at = v_opens
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited, 'direct_contractor_id', v_direct.id,
                       'direct_unavailable', v_unavailable, 'first_refusal', v_first,
                       'too_far', v_too_far));

  -- A first-refusal job reads to the customer as an ordinary one: no name.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
      'direct_contractor', case when v_first then null else v_direct.business_name end,
      'market_opens_at', case when v_first then null else v_opens end,
      'direct_unavailable', v_unavailable));

  return jsonb_build_object('ok', true, 'invited', v_invited, 'too_far', v_too_far,
                            'direct', v_direct.id is not null, 'first_refusal', v_first);
end;
$$;

-- ── open_submission_to_market: same radius when a direct window lapses ─────
create or replace function open_submission_to_market(p_submission_id uuid, p_reason text default 'customer')
returns jsonb
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
       and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng)
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

  if p_reason in ('declined', 'timeout') and not v_js.first_refusal then
    select business_name into v_name from contractors where id = v_js.preferred_contractor_id;
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_direct_fallback',
      v_js.contact_email, jsonb_build_object(
        'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
        'contractor_name', v_name, 'reason', p_reason, 'invited', v_invited));
  end if;

  return jsonb_build_object('ok', true, 'invited', v_invited);
end;
$$;

-- ── Late invites (new contractor, new county) respect the radius too ───────
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
       and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng)
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

-- ── Passing from the email ─────────────────────────────────────────────────
--
-- The email link records a pass on arrival, with 'not_interested' as the
-- reason, and the page then offers the real reason as a refinement. So a
-- second decline with a different reason is an update, not a no-op — the
-- old function answered "idempotent" and threw the better reason away.
alter table invitation_events drop constraint if exists invitation_events_event_type_check;
alter table invitation_events add constraint invitation_events_event_type_check
  check (event_type in ('sent','viewed','priced','revised','declined','undeclined','reminded',
                        'confirm_pending','confirmed','closed_awarded','closed_stale'));

create or replace function decline_invitation(p_token text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_inv job_invitations%rowtype;
begin
  if p_reason not in ('too_far','too_busy','wrong_service','not_interested') then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;
  select * into v_inv from job_invitations where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_inv.status = 'declined' then
    if v_inv.decline_reason is distinct from p_reason then
      update job_invitations set decline_reason = p_reason where id = v_inv.id;
      insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
      values (v_inv.id, v_inv.contractor_id, 'declined',
              jsonb_build_object('reason', p_reason, 'refined', true));
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_inv.status = 'priced' then return jsonb_build_object('ok', false, 'reason', 'already_priced'); end if;
  if v_inv.status in ('closed_awarded','closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  update job_invitations set status = 'declined', decline_reason = p_reason where id = v_inv.id;
  insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
  values (v_inv.id, v_inv.contractor_id, 'declined', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- A pass recorded by a tap on a link needs an undo — a thumb slips, a link
-- scanner follows it. Back to 'viewed' if they ever opened the job, else
-- 'sent'; the reason is cleared. Only while the job is still open to them:
-- once it has closed around the pass there is nothing to come back to.
create or replace function undo_decline_invitation(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv job_invitations%rowtype;
  v_js  job_submissions%rowtype;
begin
  select * into v_inv from job_invitations where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_inv.status <> 'declined' then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id;
  if v_js.status not in ('distributed', 'quotes_receiving') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  update job_invitations
     set status = case when opened_at is not null then 'viewed' else 'sent' end,
         decline_reason = null
   where id = v_inv.id;
  insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
  values (v_inv.id, v_inv.contractor_id, 'undeclined', jsonb_build_object('was', v_inv.decline_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- The tokened pages call these through the service role; nothing else should.
revoke all on function decline_invitation(text, text) from public, anon, authenticated;
revoke all on function undo_decline_invitation(text) from public, anon, authenticated;
grant execute on function decline_invitation(text, text) to service_role;
grant execute on function undo_decline_invitation(text) to service_role;
revoke all on function sq_in_invite_range(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;

-- ── One reminder to the unopened ───────────────────────────────────────────
--
-- Who: an invitation still 'sent' (never opened, never passed) that is at
-- least sq_invite_reminder_hours old, on a job that is open to the market,
-- has a day or more left, and fewer than sq_invite_reminder_max_prices
-- confirmed prices. Not a direct-only window (market_opens_at set) — that
-- contractor has their own clock. Not anyone who opted out of job emails.
--
-- Once: sq_notify_once keys on (submission, contractor, kind), so the second
-- tick finds nothing to do. The sent_at floor stops the first run after this
-- deploy from chasing every stale invitation on the books — only ones sent
-- in the last three days qualify, which is also the honest window for a
-- "yesterday's job" nudge.
create or replace function sq_invitation_reminder_tick() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r           record;
  v_allowlist jsonb;
  v_n         int := 0;
  v_hours     int := app_config_num('sq_invite_reminder_hours', 24)::int;
  v_max       int := app_config_num('sq_invite_reminder_max_prices', 3)::int;
begin
  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  for r in
    select ji.id, ji.token, ji.distance_miles, ji.submission_id, ji.contractor_id,
           ct.email, js.expires_at,
           (select count(distinct q.contractor_id) from contractor_quotes q
             where q.submission_id = js.id and q.confirmed_by_contractor) as prices
      from job_invitations ji
      join job_submissions js on js.id = ji.submission_id
      join contractors ct on ct.id = ji.contractor_id
     where ji.status = 'sent'
       and ji.sent_at <= now() - make_interval(hours => v_hours)
       and ji.sent_at >  now() - interval '3 days'
       and js.status in ('distributed', 'quotes_receiving')
       and js.market_opens_at is null
       and js.expires_at > now() + interval '24 hours'
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and ct.notify_new_jobs
       -- Invitations sent before the radius existed include contractors it
       -- would now exclude; chasing those is the noise this migration removes.
       and sq_in_invite_range(js.lat, js.lng, ct.base_lat, ct.base_lng)
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
       and not exists (select 1 from submission_notifications n
                        where n.submission_id = ji.submission_id
                          and n.recipient = ji.contractor_id::text
                          and n.kind = 'sq_invitation_reminder')
     order by ji.sent_at
  loop
    if r.prices >= v_max then continue; end if;
    if sq_notify_once(r.submission_id, r.contractor_id::text, 'sq_invitation_reminder', r.email,
         sq_job_facts(r.submission_id)
           || jsonb_build_object('token', r.token, 'distance_miles', r.distance_miles,
                                 'prices_so_far', r.prices)) then
      insert into invitation_events (invitation_id, contractor_id, event_type)
      values (r.id, r.contractor_id, 'reminded');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function sq_invitation_reminder_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'invitation-reminders') then
    perform cron.unschedule('invitation-reminders');
  end if;
  perform cron.schedule('invitation-reminders', '12,42 * * * *', $c$select sq_invitation_reminder_tick();$c$);
end $$;
