-- ============================================================================
-- Premium first look: a job opened and then left for 6 hours is a pass.
--
-- The window (20261003170000) holds a job for the premium members in range
-- until every one of them has priced or passed, or for sq_premium_reply_hours
-- (24) if none of them has priced or messaged, or for the week. A delivered
-- text nobody taps for 2 hours already counts as a pass
-- (sq_premium_text_untapped, 20261016200000) — but a member who DID open the
-- job and then did nothing was still holding it for the full day. Rebecca
-- Naylor's Derbyshire job (30 Oct) sat all afternoon on one member who had
-- opened it at 10:25 and never priced, passed or wrote.
--
-- Now opening the job starts its own clock. A premium offer whose invitation
-- has been opened (job_invitations.opened_at) sq_premium_opened_reply_hours
-- (6) ago, with no price, no pass and no message to the customer, counts as
-- passed for the window. When every member has priced, passed, sat on a
-- delivered text or sat on an opened job, the window ends through the
-- existing route: open_submission_to_market('premium_unanswered'), or
-- 'premium_untapped' when untapped texts alone ended it.
--
-- As before, the invitation itself is left alone: the member can still
-- price the job; they have simply stopped holding it. A message to the
-- customer is a response, as it is for the 24-hour rule, so a member who
-- has asked a question keeps the hold until they price or pass.
-- ============================================================================

insert into app_config (key, value) values ('sq_premium_opened_reply_hours', '6')
on conflict (key) do nothing;

-- True when this premium offer was opened at least sq_premium_opened_reply_hours
-- ago and the member has neither priced, passed nor messaged the customer.
create or replace function public.sq_premium_opened_unanswered(p_invitation_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
      from job_invitations ji
     where ji.id = p_invitation_id
       and ji.premium_offer
       and ji.status in ('sent', 'viewed')
       and ji.opened_at is not null
       and ji.opened_at
             <= now() - make_interval(hours => app_config_num('sq_premium_opened_reply_hours', 6)::int)
       and not exists (select 1 from job_messages m
                        where m.invitation_id = ji.id
                          and m.sender = 'contractor')
  )
$function$;
revoke execute on function public.sq_premium_opened_unanswered(uuid) from public, anon, authenticated;
grant execute on function public.sq_premium_opened_unanswered(uuid) to service_role;

-- Either way of sitting on it: the one predicate the window waits on.
create or replace function public.sq_premium_lapsed(p_invitation_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select sq_premium_text_untapped(p_invitation_id)
      or sq_premium_opened_unanswered(p_invitation_id)
$function$;
revoke execute on function public.sq_premium_lapsed(uuid) from public, anon, authenticated;
grant execute on function public.sq_premium_lapsed(uuid) to service_role;

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
  -- the job has priced, passed, left their text untapped or sat on it
  -- after opening it.
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
                              and not sq_premium_lapsed(ji.id)))
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
    -- no member having priced or messaged. A member counts as passed when
    -- their delivered text went untapped for sq_premium_text_reply_hours
    -- (sq_premium_text_untapped) or they opened the job and did nothing for
    -- sq_premium_opened_reply_hours (sq_premium_opened_unanswered):
    -- 'premium_unanswered' when an opened job ended the window,
    -- 'premium_untapped' when untapped texts alone did.
    select js.id,
           case when js.market_opens_at <= now() then 'premium_timeout'
                when not exists (select 1 from job_invitations ji
                                  where ji.submission_id = js.id and ji.premium_offer
                                    and ji.status in ('sent', 'viewed')) then 'premium_answered'
                when not exists (select 1 from job_invitations ji
                                  where ji.submission_id = js.id and ji.premium_offer
                                    and ji.status in ('sent', 'viewed')
                                    and not sq_premium_lapsed(ji.id)) then
                  case when exists (select 1 from job_invitations ji
                                     where ji.submission_id = js.id and ji.premium_offer
                                       and sq_premium_opened_unanswered(ji.id))
                       then 'premium_unanswered' else 'premium_untapped' end
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
                              and not sq_premium_lapsed(ji.id))
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
    if r.reason in ('premium_untapped', 'premium_unanswered') then
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
      -- And which opened the job and then left it.
      insert into job_events (job_id, event_type, actor_type, reason, metadata)
      select js_ji.submission_id, 'premium_unanswered', 'system',
             'premium member opened the job and did not price, pass or message within '
               || app_config_num('sq_premium_opened_reply_hours', 6)::int || 'h',
             jsonb_build_object('invitation_id', js_ji.id, 'contractor_id', js_ji.contractor_id,
                                'opened_at', js_ji.opened_at)
        from job_invitations js_ji
       where js_ji.submission_id = r.id
         and js_ji.premium_offer
         and sq_premium_opened_unanswered(js_ji.id);
    end if;
    perform open_submission_to_market(r.id, r.reason);
    v_n := v_n + 1;
  end loop;
  -- Windows that have outlasted the untapped-text rule: the free contractors
  -- in range hear about it, once (sq_members_first_notice). 0 hours = off.
  -- Counted from the NEWEST member invitation, not the window's start: with
  -- an Open head start the Premium members arrive at the hand-off (~2h) and
  -- their own untapped clock runs from then, so a notice keyed to the start
  -- could go out an hour before the window ended. Keep sq_members_notice_hours
  -- above sq_premium_text_reply_hours for the same reason. (The opened-job
  -- clock is longer than the notice, so a job opened at once still gets its
  -- notice before it ends.)
  if app_config_num('sq_members_notice_hours', 3) > 0 then
    for r in
      select js.id
        from job_submissions js
       where js.premium_window
         and js.market_opens_at is not null
         and js.open_first_until is null
         and js.members_notice_at is null
         and js.status in ('distributed', 'quotes_receiving')
         and (select max(ji.sent_at) from job_invitations ji
               where ji.submission_id = js.id and ji.premium_offer)
               <= now() - make_interval(mins => (app_config_num('sq_members_notice_hours', 3) * 60)::int)
    loop
      perform sq_members_first_notice(r.id);
    end loop;
  end if;

  return v_n;
end;
$function$;
