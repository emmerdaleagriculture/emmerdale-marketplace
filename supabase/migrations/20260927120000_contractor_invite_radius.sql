-- Per-contractor invite radius, and first refusal within it.
--
-- The 40-mile invite radius (20260926180000) is one figure for everyone, but
-- reach differs: Hampshire Paddock Management works up to 70 miles from its
-- base at Braishfield (SO51 6FP). contractors.invite_radius_miles overrides
-- app_config.sq_invite_radius_miles for one contractor; null keeps the default.
--
-- First refusal now checks the same radius. HPM's first-refusal area is its
-- seven counties, which reach 82 miles from base: on 26 Sep an East Sussex
-- job 82 miles away was offered to HPM first, declined as too far within a
-- minute, and only then opened to the market. Out of reach, a job now skips
-- the offer and goes straight to the market.
--
-- Every call site passes the contractor's own radius: distribution, opening
-- to market, late invites to open jobs, and the 24h reminder.

alter table contractors
  add column if not exists invite_radius_miles numeric
    check (invite_radius_miles is null or invite_radius_miles > 0);

comment on column contractors.invite_radius_miles is
  'How far from base this contractor is invited to jobs, in miles. Null uses app_config.sq_invite_radius_miles (40).';

-- A new trailing parameter, so the four-argument form goes: leaving it would
-- make every four-argument call ambiguous between the two.
drop function if exists sq_in_invite_range(numeric, numeric, numeric, numeric);

create function public.sq_in_invite_range(
  p_job_lat numeric, p_job_lng numeric, p_ct_lat numeric, p_ct_lng numeric,
  p_radius_miles numeric default null)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when p_job_lat is null or p_job_lng is null or p_ct_lat is null or p_ct_lng is null then true
    else haversine_miles(p_job_lat, p_job_lng, p_ct_lat, p_ct_lng)
           <= coalesce(p_radius_miles, app_config_num('sq_invite_radius_miles', 40))
  end;
$function$;

revoke all on function sq_in_invite_range(numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.distribute_submission(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         -- Only within the contractor's reach: HPM's counties run 80+ miles
         -- from its base, and an out-of-range offer is a decline and a delay.
         and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
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
             sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles) as near
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
$function$;

CREATE OR REPLACE FUNCTION public.open_submission_to_market(p_submission_id uuid, p_reason text DEFAULT 'customer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_match     record;
  v_invited   int := 0;
  v_too_far   int := 0;
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
    select ct.id,
           sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles) as near
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
    elsif sq_invite_contractor(v_js.id, v_match.id, jsonb_build_object('opened_to_market', p_reason)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  update job_submissions
     set market_opens_at = null,
         distributed_at = now(),
         expires_at = greatest(expires_at,
           now() + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
   where id = v_js.id;

  perform log_job_event(v_js.id, 'market_opened', null, null, 'system', null, null,
    jsonb_build_object('reason', p_reason, 'invited_count', v_invited, 'too_far', v_too_far));

  -- Nobody to price it. The job stays open (the direct contractor's own
  -- invitation may still be live) but it is now an admin's problem, said so.
  if v_invited = 0 then
    perform sq_notify_once(v_js.id, '__admin__', 'sq_no_matches', '__admin__',
      sq_job_facts(v_js.id) || jsonb_build_object('supply_gap', true, 'too_far', v_too_far,
                                                  'market_opened', true));
  end if;

  if p_reason in ('declined', 'timeout') and not v_js.first_refusal then
    select business_name into v_name from contractors where id = v_js.preferred_contractor_id;
    perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'), 'sq_direct_fallback',
      v_js.contact_email, jsonb_build_object(
        'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
        'contractor_name', v_name, 'reason', p_reason, 'invited', v_invited));
  end if;

  return jsonb_build_object('ok', true, 'invited', v_invited, 'too_far', v_too_far);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sq_invitation_reminder_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select ji.id, ji.token, ji.distance_miles, ji.submission_id, ji.contractor_id, ji.sent_at,
           ct.email, p.prices
      from job_invitations ji
      join job_submissions js on js.id = ji.submission_id
      join contractors ct on ct.id = ji.contractor_id
      -- Once per job, not once per invitation, and decided in the query.
      join lateral (
        select count(distinct q.contractor_id) as prices
          from contractor_quotes q
         where q.submission_id = js.id and q.confirmed_by_contractor
      ) p on p.prices < v_max
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
       -- would now exclude; chasing those is the noise the radius removes.
       and sq_in_invite_range(js.lat, js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
     order by ji.sent_at
  loop
    -- sq_notify_once is the once: (job, contractor, kind) is its key.
    if sq_notify_once(r.submission_id, r.contractor_id::text, 'sq_invitation_reminder', r.email,
         sq_job_facts(r.submission_id)
           || jsonb_build_object('token', r.token, 'distance_miles', r.distance_miles,
                                 'prices_so_far', r.prices, 'sent_at', r.sent_at)) then
      insert into invitation_events (invitation_id, contractor_id, event_type)
      values (r.id, r.contractor_id, 'reminded');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_contractor_to_open_jobs(p_contractor_id uuid, p_county_id integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
     order by js.expires_at
       for share of js skip locked
  loop
    if sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object('late_join', true)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  return v_invited;
end;
$function$;

-- HPM: 70 miles from Braishfield.
update contractors set invite_radius_miles = 70
 where id = '34d6e50f-cc78-4bf4-9021-9f5bfd1840fa';
