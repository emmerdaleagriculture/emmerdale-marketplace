-- A contractor who only wants certain kinds of work, wherever it is (2026-10-09).
--
-- R A Mansbridge delivers hay and straw across the whole country and wants
-- every hay/straw job we get — and nothing else. Routing today is county plus
-- a distance from base; a job's service is not consulted (20260904180000 took
-- it out of matching, because contractors tick nearly everything and a job
-- with no service_id must still reach someone). So "all 88 counties" would
-- have sent him every job in the country.
--
-- This adds one per-contractor switch, services_only: when it is on, the
-- market paths invite them only to jobs whose service is one they ticked.
-- Off (the default, everyone today) changes nothing. A job with no service_id
-- falls back to the keyword label the public strips already use
-- (service_label_from_text over what the customer wrote); a job that matches
-- nothing stays "not theirs" — unknown work is the opposite of a narrow ask.
--
-- Direct offers (a repeat customer naming them, first refusal) are not
-- filtered: those are by name. Nationwide is expressed with what already
-- exists — every county plus a per-contractor invite_radius_miles no UK job
-- can exceed — set from the admin contractor page.

alter table public.contractors
  add column if not exists services_only boolean not null default false;

comment on column public.contractors.services_only is
  'When true, market invitations (distribution, late joins, premium window, reminders) go to this contractor only for jobs whose service is in contractors.services. Direct and first-refusal offers are not filtered.';

-- ── Is this job work the contractor asked for? ─────────────────────────────
create or replace function public.sq_contractor_wants_job(p_ct public.contractors, p_js public.job_submissions)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when not coalesce(p_ct.services_only, false) then true
    when p_js.service_id is not null then
      p_js.service_id = any(coalesce(p_ct.services, '{}'::int[]))
    else exists (
      select 1
        from services s
       where s.id = any(coalesce(p_ct.services, '{}'::int[]))
         and s.name = service_label_from_text(
               concat_ws(' ', p_js.service_verbatim, p_js.raw_text, p_js.details_text)))
  end
$function$;

-- Admin › Contractors can say why a contractor covers 30+ counties.
create or replace view public.admin_contractor_outreach as
 select c.id as contractor_id,
        (select count(*) from contractor_counties cc where cc.contractor_id = c.id)::int as counties,
        (select count(*) from job_invitations i where i.contractor_id = c.id)::int as invited,
        (select count(i.opened_at) from job_invitations i where i.contractor_id = c.id)::int as opened,
        c.services_only
   from contractors c;

-- ── The market paths gain the filter ───────────────────────────────────────
-- Each body is the live one with a single `and sq_contractor_wants_job(…)`
-- added to the contractor match: distribute_submission's market loop,
-- open_submission_to_market, sq_start_premium_window,
-- invite_contractor_to_open_jobs (late joins — which the county-insert
-- trigger also runs, so ticking every county for a services_only contractor
-- catches them up on open jobs of their kind only), the reminder tick, and
-- the digest's "new in your area" count.

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
  v_premium    boolean := false;
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
       -- Their email bounces: they would never see the offer, and the
       -- customer would wait out the whole window for nobody.
       and not email_undeliverable(ct.email)
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
         and not email_undeliverable(ct.email)
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

  -- Premium members in range get it before the market: up to
  -- sq_premium_window_hours, or until every one of them has priced or passed.
  if v_direct.id is null and v_js.repeat_of is null then
    v_invited := sq_start_premium_window(v_js.id);
    if v_invited > 0 then
      v_premium := true;
      select market_opens_at into v_opens from job_submissions where id = v_js.id;
    end if;
  end if;

  if v_direct.id is null and not v_premium then
    for v_match in
      select ct.id,
             sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles) as near
        from contractors ct
        join contractor_counties cc on cc.contractor_id = ct.id
       where cc.county_id = v_js.county_id
         and ct.status = 'approved'
         and ct.vetted_at is not null
         and sq_contractor_wants_job(ct, v_js)
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
         expires_at = greatest(coalesce(v_opens, now()), now())
                      + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int),
         market_opens_at = v_opens
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'confirmed', 'distributed', 'system', null, null,
    jsonb_build_object('invited_count', v_invited, 'direct_contractor_id', v_direct.id,
                       'direct_unavailable', v_unavailable, 'first_refusal', v_first,
                       'premium_window', v_premium, 'too_far', v_too_far));

  -- A first-refusal or premium-window job reads to the customer as an
  -- ordinary one: no name, no date.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_portal_link',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token, 'contact_name', v_js.contact_name,
      'direct_contractor', case when v_first or v_premium then null else v_direct.business_name end,
      'market_opens_at', case when v_first or v_premium then null else v_opens end,
      'direct_unavailable', v_unavailable));

  return jsonb_build_object('ok', true, 'invited', v_invited, 'too_far', v_too_far,
                            'direct', v_direct.id is not null, 'first_refusal', v_first,
                            'premium_window', v_premium);
end;
$function$
;

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
  v_premium   int;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.market_opens_at is null then return jsonb_build_object('ok', false, 'reason', 'not_direct'); end if;
  if v_js.status not in ('distributed', 'quotes_receiving') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- HPM first, then premium, then everyone: a first-refusal offer that
  -- lapses, is declined, sits unaccepted or has its price passed goes to premium members before the
  -- market. Once only — the premium window's own ending opens the market.
  if v_js.first_refusal and not v_js.premium_window
     and p_reason in ('declined', 'timeout', 'unaccepted', 'passed') then
    v_premium := sq_start_premium_window(v_js.id);
    if v_premium > 0 then
      return jsonb_build_object('ok', true, 'premium_window', true, 'invited', v_premium);
    end if;
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
       and sq_contractor_wants_job(ct, v_js)
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
$function$
;

CREATE OR REPLACE FUNCTION public.sq_start_premium_window(p_submission_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_ct        record;
  v_n         int := 0;
  v_hours     int := app_config_num('sq_premium_window_hours', 168)::int;
  v_opens     timestamptz;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.premium_window or v_js.repeat_of is not null
     or v_js.extra_work_of is not null or v_hours <= 0 then
    return 0;
  end if;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);
  v_opens := now() + make_interval(hours => v_hours);

  for v_ct in
    select ct.id
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id and cc.county_id = v_js.county_id
     where ct.status = 'approved'
       and ct.vetted_at is not null
       and contractor_is_premium(ct.id)
       and sq_contractor_wants_job(ct, v_js)
       and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
       and not exists (select 1 from job_invitations ji
                        where ji.submission_id = v_js.id and ji.contractor_id = ct.id)
  loop
    if sq_invite_contractor(v_js.id, v_ct.id,
         jsonb_build_object('premium', true, 'market_opens_at', v_opens)) then
      update job_invitations set premium_offer = true
       where submission_id = v_js.id and contractor_id = v_ct.id;
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n > 0 then
    update job_submissions
       set premium_window = true,
           premium_started_at = now(),
           market_opens_at = v_opens,
           expires_at = greatest(coalesce(expires_at, now()),
             v_opens + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
     where id = v_js.id;
    perform log_job_event(v_js.id, 'premium_window', null, null, 'system', null, null,
      jsonb_build_object('invited', v_n, 'market_opens_at', v_opens));
  end if;
  return v_n;
end;
$function$
;

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
  v_premium   boolean := contractor_is_premium(p_contractor_id);
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
    select js.id, js.market_opens_at
      from job_submissions js
      join contractor_counties cc
        on cc.county_id = js.county_id and cc.contractor_id = v_ct.id
     where js.status in ('distributed', 'quotes_receiving')
       -- Held jobs are someone's window — except a premium window, which a
       -- premium member joins late like any other.
       and (js.market_opens_at is null
            or (js.premium_window and v_premium))
       and js.expires_at > now() + make_interval(hours => app_config_num('sq_late_invite_min_hours', 12)::int)
       and (p_county_id is null or js.county_id = p_county_id)
       and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
       and sq_contractor_wants_job(v_ct, js)
     order by js.expires_at
       for share of js skip locked
  loop
    if v_js.market_opens_at is not null then
      if sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object(
           'late_join', true, 'premium', true, 'market_opens_at', v_js.market_opens_at)) then
        update job_invitations set premium_offer = true
         where submission_id = v_js.id and contractor_id = v_ct.id;
        v_invited := v_invited + 1;
      end if;
    elsif sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object('late_join', true)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  return v_invited;
end;
$function$
;

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
       and sq_contractor_wants_job(ct, js)
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
$function$
;

CREATE OR REPLACE FUNCTION public.sq_weekly_digest_payload(p_contractor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ct        contractors%rowtype;
  v_jobs      jsonb;
  v_open      int;
  v_area_new  int;
  v_counties  text[];
  v_national  int;
  v_messages  jsonb;
  v_won       jsonb;
begin
  select * into v_ct from contractors where id = p_contractor_id;
  if not found then return null; end if;

  select coalesce(jsonb_agg(j order by j->>'expires_at'), '[]'::jsonb), count(*)
    into v_jobs, v_open
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'county', c.name,
               'acres', coalesce(js.area_mapped_value,
                                 case js.area_unit when 'acres' then js.area_value
                                                   when 'hectares' then round(js.area_value * 2.47105, 1) end),
               'distance_miles', ji.distance_miles,
               'expires_at', js.expires_at,
               'prices_so_far', (select count(distinct q.contractor_id) from contractor_quotes q
                                  where q.submission_id = js.id and q.confirmed_by_contractor),
               'token', ji.token) as j
        from job_invitations ji
        join job_submissions js on js.id = ji.submission_id
        left join counties c on c.id = js.county_id
       where ji.contractor_id = p_contractor_id
         and ji.status in ('sent', 'viewed')
         and js.status in ('distributed', 'quotes_receiving')
         and js.hidden_at is null
         and js.expires_at > now() + interval '12 hours'
         and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
       order by js.expires_at
       limit 10
    ) t;

  select count(*) into v_area_new
    from job_submissions js
   where js.county_id in (select county_id from contractor_counties where contractor_id = p_contractor_id)
     and sq_contractor_wants_job(v_ct, js)
     and js.distributed_at > now() - interval '7 days'
     and js.hidden_at is null;

  select array_agg(name order by name) into v_counties
    from (select c.name from contractor_counties cc join counties c on c.id = cc.county_id
           where cc.contractor_id = p_contractor_id order by c.name limit 4) x;

  select count(*) into v_national from job_submissions
   where status in ('distributed', 'quotes_receiving') and hidden_at is null and expires_at > now();

  -- Customers waiting on a reply: unread messages in threads still open.
  -- Held messages are the moderator's, not the contractor's, so they are
  -- left out, exactly as the page leaves them out.
  select coalesce(jsonb_agg(m order by m->>'last_at' desc), '[]'::jsonb) into v_messages
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'from', case when sq_thread_state(ji.id) = 'post_award'
                            then coalesce(split_part(js.contact_name, ' ', 1), 'The customer')
                            else 'The customer' end,
               'unread', count(*),
               'last_at', max(jm.created_at),
               'snippet', left((array_agg(jm.body order by jm.created_at desc))[1], 120),
               'token', ji.token) as m
        from job_messages jm
        join job_invitations ji on ji.id = jm.invitation_id
        join job_submissions js on js.id = jm.submission_id
       where ji.contractor_id = p_contractor_id
         and jm.sender = 'client' and jm.read_at is null
         and coalesce(jm.moderation, 'approved') = 'approved'
         and sq_thread_state(ji.id) <> 'closed'
       group by ji.id, ji.token, js.id
       limit 10
    ) t;

  -- Booked jobs with something for them to do, and what it is.
  select coalesce(jsonb_agg(w order by w->>'awarded_at' desc), '[]'::jsonb) into v_won
    from (
      select jsonb_build_object(
               'service', sq_service_label(js.service_id, js.service_verbatim),
               'customer', split_part(coalesce(js.contact_name, 'the customer'), ' ', 1),
               'postcode_district', split_part(js.postcode, ' ', 1),
               'awarded_at', js.awarded_at,
               'next', case
                 when js.visit_status = 'awaiting_visit' then 'visit'
                 when js.status in ('completed', 'paid') then 'invoice'
                 else 'mark_done' end,
               'due_at', js.visit_due_at) as w
        from job_submissions js
       where js.awarded_contractor_id = p_contractor_id
         and (
           js.status in ('awarded', 'contacted', 'scheduled', 'in_progress')
           or (js.status in ('completed', 'paid') and js.contractor_invoice_path is null
               and not exists (select 1 from contractor_payouts cp where cp.submission_id = js.id))
         )
       limit 10
    ) t;

  if v_open = 0 and v_area_new = 0
     and jsonb_array_length(v_messages) = 0 and jsonb_array_length(v_won) = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'business_name', v_ct.business_name,
    'contact_name', v_ct.contact_name,
    'jobs', v_jobs,
    'open_count', v_open,
    'area_new', v_area_new,
    'counties', to_jsonb(coalesce(v_counties, '{}')),
    'county_count', (select count(*) from contractor_counties where contractor_id = p_contractor_id),
    'national_open', v_national,
    'messages', v_messages,
    'won', v_won);
end;
$function$
;
