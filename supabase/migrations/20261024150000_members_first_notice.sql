-- ============================================================================
-- Members first: tell the free contractors.
--
-- Since 20261003170000 a new job in range of a paying member goes to members
-- first, for up to sq_premium_window_hours, and the rest of the network hears
-- nothing until the window ends. In the seven windows so far that was two
-- hours in the usual case (one member in range, text untapped), nine at most:
-- a "coming soon" email to everyone else would land two hours before the
-- real invitation. So three smaller things instead, all factual, none a
-- forecast:
--
--   1. The invitation sent when the market opens says members had it first
--      (job_invitations' sent event and the sq_invitation payload carry
--      members_first), and what membership costs. No extra email.
--   2. The Monday digest counts the jobs in a contractor's counties that
--      went to members first this week (members_first in the payload).
--   3. A window that is still running sq_members_notice_hours (3) after it
--      started has outlasted the untapped-text rule, so the job will sit
--      with members for the 24-hour no-reply rule at least. The free
--      contractors it would otherwise have reached are told once, by
--      sq_members_first_notice from the direct-window tick: what the job is,
--      that members have it, that it opens to them if no member takes it,
--      and nothing about the customer (sq_job_facts carries no contact).
--      Recorded on job_submissions.members_notice_at and a members_notice
--      job event. 0 hours turns it off.
--
-- Members themselves never see any of it: a member in range was invited in
-- the window, so is excluded by the existing not-yet-invited check, and the
-- invitation flag and digest count are both false/0 for anyone who holds
-- Premium or Open.
-- ============================================================================

insert into app_config (key, value) values ('sq_members_notice_hours', '3')
on conflict (key) do nothing;

alter table public.job_submissions add column if not exists members_notice_at timestamptz;

-- 1. The market-open invitation says members had it first.
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
    elsif sq_invite_contractor(v_js.id, v_match.id,
             jsonb_build_object('opened_to_market', p_reason,
                                -- Members were offered it before this contractor.
                                'members_first', v_js.premium_window
                                                 and not contractor_is_premium(v_match.id))) then
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
$function$

;

-- 2. The digest counts the week's members-first jobs in their counties.
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
  v_members_first int := 0;
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

  -- Jobs in their counties that went to members first this week. A member
  -- was offered them, so for a member the count is noise: 0.
  if not contractor_is_premium(p_contractor_id) then
    select count(*) into v_members_first
      from job_submissions js
     where js.county_id in (select county_id from contractor_counties where contractor_id = p_contractor_id)
       and sq_contractor_wants_job(v_ct, js)
       and js.premium_window
       and js.premium_started_at > now() - interval '7 days'
       and js.hidden_at is null;
  end if;

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
    'members_first', v_members_first,
    'counties', to_jsonb(coalesce(v_counties, '{}')),
    'county_count', (select count(*) from contractor_counties where contractor_id = p_contractor_id),
    'national_open', v_national,
    'messages', v_messages,
    'won', v_won);
end;
$function$

;

-- 3. The notice to free contractors in range, once per job.
create or replace function public.sq_members_first_notice(p_submission_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_js        job_submissions%rowtype;
  v_allowlist jsonb;
  v_match     record;
  v_n         int := 0;
  v_members   int;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found or not v_js.premium_window or v_js.market_opens_at is null
     or v_js.members_notice_at is not null
     or v_js.status not in ('distributed', 'quotes_receiving') then
    return 0;
  end if;

  select count(*) into v_members
    from job_invitations where submission_id = v_js.id and premium_offer;

  v_allowlist := coalesce(
    (select value from app_config where key = 'sq_test_contractor_allowlist'), '[]'::jsonb);

  -- The same contractors open_submission_to_market would invite, less the
  -- members (already invited, so caught by the last clause anyway) and
  -- anyone who has turned job emails off: this is a job email.
  for v_match in
    select ct.id, ct.email
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
     where cc.county_id = v_js.county_id
       and ct.status = 'approved'
       and ct.vetted_at is not null
       and ct.notify_new_jobs
       and not contractor_is_premium(ct.id)
       and not email_undeliverable(ct.email)
       and sq_contractor_wants_job(ct, v_js)
       and sq_in_invite_range(v_js.lat, v_js.lng, ct.base_lat, ct.base_lng, ct.invite_radius_miles)
       and (jsonb_array_length(v_allowlist) = 0
            or ct.email in (select jsonb_array_elements_text(v_allowlist)))
       and not exists (select 1 from job_invitations ji
                        where ji.submission_id = v_js.id and ji.contractor_id = ct.id)
  loop
    if sq_notify_once(v_js.id, v_match.id::text, 'sq_members_first_notice', v_match.email,
         sq_job_facts(v_js.id)
           || jsonb_build_object('market_opens_at', v_js.market_opens_at,
                                 'members_invited', v_members,
                                 'contractor_id', v_match.id)) then
      v_n := v_n + 1;
    end if;
  end loop;

  update job_submissions set members_notice_at = now() where id = v_js.id;
  perform log_job_event(v_js.id, 'members_notice', null, null, 'system', null, null,
    jsonb_build_object('notified', v_n, 'members_invited', v_members,
                       'market_opens_at', v_js.market_opens_at));
  return v_n;
end;
$function$;
revoke execute on function public.sq_members_first_notice(uuid) from public, anon, authenticated;
grant execute on function public.sq_members_first_notice(uuid) to service_role;

-- The tick sends it, after the window loop: a window that opened on this
-- very tick has market_opens_at nulled and is not noticed.
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
  -- Windows that have outlasted the untapped-text rule: the free contractors
  -- in range hear about it, once (sq_members_first_notice). 0 hours = off.
  if app_config_num('sq_members_notice_hours', 3) > 0 then
    for r in
      select js.id
        from job_submissions js
       where js.premium_window
         and js.market_opens_at is not null
         and js.members_notice_at is null
         and js.status in ('distributed', 'quotes_receiving')
         and js.premium_started_at
               <= now() - make_interval(mins => (app_config_num('sq_members_notice_hours', 3) * 60)::int)
    loop
      perform sq_members_first_notice(r.id);
    end loop;
  end if;

  return v_n;
end;
$function$

;
