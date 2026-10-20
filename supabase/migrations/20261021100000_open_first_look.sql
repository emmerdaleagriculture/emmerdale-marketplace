-- ============================================================================
-- Open members first.
--
-- The premium window (20261003170000) sent a new job to every member in
-- range at the same moment, Open and Premium alike. Now Open members get
-- it first: the Premium members in range follow sq_open_first_hours later
-- (2), or as soon as every Open member offered it has priced or passed —
-- an untapped text counting as a pass after sq_premium_text_reply_hours,
-- the same as for the window itself. Then the window runs as before, and
-- the market after it.
--
-- Nothing else moves. market_opens_at, the 24-hour no-reply rule and the
-- 7-day hold still count from the window's start, so the customer waits
-- no longer than today: a Premium member simply sees the job two hours
-- into the window instead of at its start. With no Open member in range,
-- or no Premium-only member waiting behind them, there is no head start
-- and everyone is invited at once, as before.
--
-- Recorded on job_submissions.open_first_until (non-null while the head
-- start runs; the tick nulls it at the hand-off) and job_invitations
-- .open_first (the invitations sent during it). Keep sq_open_first_hours
-- under sq_premium_reply_hours: branch C of the tick waits for the
-- hand-off, so a head start longer than the no-reply rule would hold the
-- job past it.
-- ============================================================================

insert into app_config (key, value) values ('sq_open_first_hours', '2')
on conflict (key) do nothing;

alter table public.job_submissions add column if not exists open_first_until timestamptz;
alter table public.job_invitations add column if not exists open_first boolean not null default false;

-- Who a premium window would invite now: every vetted member covering the
-- county and in range who wants the work, can be emailed, and has not
-- already been invited, with their tier. The one query the window start, the hand-off and the
-- late joiner share.
create or replace function public.sq_premium_candidates(p_submission_id uuid)
 returns table (contractor_id uuid, is_open boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with allow as (
    select coalesce((select value from app_config where key = 'sq_test_contractor_allowlist'),
                    '[]'::jsonb) as v
  )
  select ct.id, contractor_is_open(ct.id)
    from job_submissions js
    join contractor_counties cc on cc.county_id = js.county_id
    join contractors ct on ct.id = cc.contractor_id
    cross join allow
   where js.id = p_submission_id
     and ct.status = 'approved'
     and ct.vetted_at is not null
     and contractor_is_premium(ct.id)
     and not email_undeliverable(ct.email)
     and sq_contractor_wants_job(ct, js)
     and sq_in_invite_range(js.lat, js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
     and (jsonb_array_length(allow.v) = 0
          or ct.email in (select jsonb_array_elements_text(allow.v)))
     and not exists (select 1 from job_invitations ji
                      where ji.submission_id = js.id and ji.contractor_id = ct.id)
$function$;
revoke execute on function public.sq_premium_candidates(uuid) from public, anon, authenticated;
grant execute on function public.sq_premium_candidates(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.sq_start_premium_window(p_submission_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js      job_submissions%rowtype;
  v_id      uuid;
  v_open    uuid[] := '{}';
  v_waiting uuid[] := '{}';
  v_n       int := 0;
  v_hours   int := app_config_num('sq_premium_window_hours', 168)::int;
  v_reply   int := app_config_num('sq_premium_reply_hours', 24)::int;
  v_head    int := app_config_num('sq_open_first_hours', 2)::int;
  v_staged  boolean := false;
  v_opens   timestamptz;
  v_extra   jsonb;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.premium_window or v_js.repeat_of is not null
     or v_js.extra_work_of is not null or v_hours <= 0 then
    return 0;
  end if;

  v_opens := now() + make_interval(hours => v_hours);
  -- The deadline the no-reply rule works to, said in the invitation.
  v_extra := jsonb_build_object('premium', true, 'market_opens_at', v_opens,
                                'reply_by', now() + make_interval(hours => v_reply));

  -- The candidates, read once and sorted by tier.
  select coalesce(array_agg(c.contractor_id) filter (where c.is_open), '{}'),
         coalesce(array_agg(c.contractor_id) filter (where not c.is_open), '{}')
    into v_open, v_waiting
    from sq_premium_candidates(v_js.id) c;

  -- A head start only when there is someone to have it and someone to wait.
  v_staged := v_head > 0 and cardinality(v_open) > 0 and cardinality(v_waiting) > 0;

  if v_staged then
    foreach v_id in array v_open loop
      if sq_invite_contractor(v_js.id, v_id,
           v_extra || jsonb_build_object('open_first', true, 'open_first_hours', v_head)) then
        update job_invitations set premium_offer = true, open_first = true
         where submission_id = v_js.id and contractor_id = v_id;
        v_n := v_n + 1;
      end if;
    end loop;
    -- Every Open member turned out unreachable: no head start after all.
    if v_n = 0 then v_staged := false; end if;
  end if;

  if not v_staged then
    foreach v_id in array (v_open || v_waiting) loop
      if sq_invite_contractor(v_js.id, v_id, v_extra) then
        update job_invitations set premium_offer = true
         where submission_id = v_js.id and contractor_id = v_id;
        v_n := v_n + 1;
      end if;
    end loop;
  end if;

  if v_n > 0 then
    update job_submissions
       set premium_window = true,
           premium_started_at = now(),
           market_opens_at = v_opens,
           open_first_until = case when v_staged
                                   then now() + make_interval(hours => v_head) end,
           expires_at = greatest(coalesce(expires_at, now()),
             v_opens + make_interval(days => app_config_num('sq_job_expiry_days', 7)::int))
     where id = v_js.id;
    perform log_job_event(v_js.id, 'premium_window', null, null, 'system', null, null,
      jsonb_build_object('invited', v_n, 'market_opens_at', v_opens,
                         'open_first', v_staged, 'premium_waiting',
                         case when v_staged then cardinality(v_waiting) else 0 end));
  end if;
  return v_n;
end;
$function$;

-- The hand-off: the Premium members who waited behind the Open members
-- are invited now, the head start ends, and the window carries on.
create or replace function public.sq_open_first_handoff(p_submission_id uuid, p_reason text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_js job_submissions%rowtype;
  v_ct record;
  v_n  int := 0;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found or not v_js.premium_window or v_js.open_first_until is null
     or v_js.market_opens_at is null
     or v_js.status not in ('distributed', 'quotes_receiving') then
    return 0;
  end if;

  -- The no-reply rule still counts from the window's start, so the
  -- invitation names that deadline rather than promising a fresh 24 hours.
  for v_ct in select c.contractor_id from sq_premium_candidates(v_js.id) c loop
    if sq_invite_contractor(v_js.id, v_ct.contractor_id,
         jsonb_build_object('premium', true, 'market_opens_at', v_js.market_opens_at,
                            'reply_by', v_js.premium_started_at
                              + make_interval(hours => app_config_num('sq_premium_reply_hours', 24)::int))) then
      update job_invitations set premium_offer = true
       where submission_id = v_js.id and contractor_id = v_ct.contractor_id;
      v_n := v_n + 1;
    end if;
  end loop;

  update job_submissions set open_first_until = null where id = v_js.id;
  perform log_job_event(v_js.id, 'premium_invited', null, null, 'system', null, p_reason,
    jsonb_build_object('invited', v_n));
  return v_n;
end;
$function$;
revoke execute on function public.sq_open_first_handoff(uuid, text) from public, anon, authenticated;
grant execute on function public.sq_open_first_handoff(uuid, text) to service_role;

-- The tick: a new first pass hands Open-first jobs over to Premium when the
-- head start lapses or every Open member has answered; branch C then
-- leaves a job alone until that hand-off has happened. A, B and the rest
-- of C are as in 20261016200000.
CREATE OR REPLACE FUNCTION public.sq_direct_window_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     record;
  v_n   int := 0;
begin
  -- The Open head start ends: on time, or once every Open member offered
  -- the job has priced, passed or left their text untapped.
  for r in
    select js.id,
           case when js.open_first_until <= now() then 'open_first_timeout'
                else 'open_first_answered' end as reason
      from job_submissions js
     where js.premium_window
       and js.open_first_until is not null
       and js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and (js.open_first_until <= now()
            or not exists (select 1 from job_invitations ji
                            where ji.submission_id = js.id
                              and ji.open_first
                              and ji.status in ('sent', 'viewed')
                              and not sq_premium_text_untapped(ji.id)))
  loop
    perform sq_open_first_handoff(r.id, r.reason);
    v_n := v_n + 1;
  end loop;

  for r in
    -- Branch A: the contractor never priced it. Opens when their window
    -- lapses, when they decline, or when there is no preferred contractor
    -- to wait for.
    select js.id,
           case
             when exists (select 1 from job_invitations ji
                           where ji.submission_id = js.id
                             and ji.contractor_id = js.preferred_contractor_id
                             and ji.status = 'declined') then 'declined'
             else 'timeout'
           end as reason
      from job_submissions js
     where js.market_opens_at is not null
       and not js.premium_window
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

    union all

    -- Branch B: they DID price it, and the customer has sat on it. Keyed
    -- to quotes_notified_at and NOT to market_opens_at — that one is the
    -- pricing window, is long past on any job that reached this state, and
    -- would fire every such job on the next tick.
    select js.id, 'unaccepted' as reason
      from job_submissions js
     where js.first_refusal
       and not js.premium_window
       and js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and js.quotes_notified_at is not null
       and js.quotes_notified_at
             <= now() - make_interval(hours => app_config_num('sq_first_refusal_accept_hours', 48)::int)
       and exists (select 1 from contractor_quotes q
                    where q.submission_id = js.id
                      and q.contractor_id = js.preferred_contractor_id
                      and q.confirmed_by_contractor)
       and not exists (select 1 from client_quotes cq
                        where cq.submission_id = js.id
                          and cq.status = 'accepted')
       and js.accepted_client_quote_id is null

    union all

    -- Branch C: a premium window, once the Open head start (if any) has
    -- handed over. Opens when it lapses, as soon as every premium member
    -- offered it has priced or passed, or after sq_premium_reply_hours with
    -- no member having priced or messaged. A member whose delivered text
    -- went untapped for sq_premium_text_reply_hours counts as passed
    -- (sq_premium_text_untapped): 'premium_untapped' when that is what
    -- ended the window.
    select js.id,
           case when js.market_opens_at <= now() then 'premium_timeout'
                when not exists (select 1 from job_invitations ji
                                  where ji.submission_id = js.id and ji.premium_offer
                                    and ji.status in ('sent', 'viewed')) then 'premium_answered'
                when not exists (select 1 from job_invitations ji
                                  where ji.submission_id = js.id and ji.premium_offer
                                    and ji.status in ('sent', 'viewed')
                                    and not sq_premium_text_untapped(ji.id)) then 'premium_untapped'
                else 'premium_no_reply' end as reason
      from job_submissions js
     where js.premium_window
       and js.open_first_until is null
       and js.market_opens_at is not null
       and js.status in ('distributed', 'quotes_receiving')
       and (js.market_opens_at <= now()
            or not exists (select 1 from job_invitations ji
                            where ji.submission_id = js.id
                              and ji.premium_offer
                              and ji.status in ('sent', 'viewed')
                              and not sq_premium_text_untapped(ji.id))
            or (js.premium_started_at
                  <= now() - make_interval(hours => app_config_num('sq_premium_reply_hours', 24)::int)
                and not exists (select 1 from job_invitations ji
                                 where ji.submission_id = js.id
                                   and ji.premium_offer
                                   and (ji.status = 'priced'
                                        or exists (select 1 from job_messages m
                                                    where m.invitation_id = ji.id
                                                      and m.sender = 'contractor')))))
  loop
    if r.reason = 'premium_untapped' then
      -- Say which members sat on their text, once each, before the window ends.
      insert into job_events (job_id, event_type, actor_type, reason, metadata)
      select js_ji.submission_id, 'premium_untapped', 'system',
             'premium member did not tap the text within '
               || app_config_num('sq_premium_text_reply_hours', 2)::int || 'h',
             jsonb_build_object('invitation_id', js_ji.id, 'contractor_id', js_ji.contractor_id)
        from job_invitations js_ji
       where js_ji.submission_id = r.id
         and js_ji.premium_offer
         and sq_premium_text_untapped(js_ji.id);
    end if;
    perform open_submission_to_market(r.id, r.reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

-- A late joiner: during the head start only an Open member may join a
-- premium window; a Premium member waits for the hand-off like the rest.
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
  v_open      boolean := contractor_is_open(p_contractor_id);
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
    select js.id, js.market_opens_at, js.open_first_until
      from job_submissions js
      join contractor_counties cc
        on cc.county_id = js.county_id and cc.contractor_id = v_ct.id
     where js.status in ('distributed', 'quotes_receiving')
       -- Held jobs are someone's window — except a premium window, which a
       -- premium member joins late like any other, and which during the
       -- Open head start only an Open member may join.
       and (js.market_opens_at is null
            or (js.premium_window and v_premium
                and (js.open_first_until is null or v_open)))
       and js.expires_at > now() + make_interval(hours => app_config_num('sq_late_invite_min_hours', 12)::int)
       and (p_county_id is null or js.county_id = p_county_id)
       and sq_in_invite_range(js.lat, js.lng, v_ct.base_lat, v_ct.base_lng, v_ct.invite_radius_miles)
       and sq_contractor_wants_job(v_ct, js)
     order by js.expires_at
       for share of js skip locked
  loop
    if v_js.market_opens_at is not null then
      if sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object(
           'late_join', true, 'premium', true, 'market_opens_at', v_js.market_opens_at)
           || case when v_js.open_first_until is not null
                   then jsonb_build_object('open_first', true,
                          'open_first_hours', app_config_num('sq_open_first_hours', 2)::int)
                   else '{}'::jsonb end) then
        update job_invitations
           set premium_offer = true, open_first = (v_js.open_first_until is not null)
         where submission_id = v_js.id and contractor_id = v_ct.id;
        v_invited := v_invited + 1;
      end if;
    elsif sq_invite_contractor(v_js.id, v_ct.id, jsonb_build_object('late_join', true)) then
      v_invited := v_invited + 1;
    end if;
  end loop;

  return v_invited;
end;
$function$;

-- open_submission_to_market, as in 20261009120000 but for one line: a
-- window that ends early (the customer passes on a price, an admin opens
-- the job) takes any head start with it, so open_first_until is null
-- whenever market_opens_at is.
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
         open_first_until = null,
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
