-- ============================================================================
-- Premium first look: a delivered text nobody tapped in 2 hours is a pass.
--
-- A premium window (20261003170000) holds a job for the premium members in
-- range until every one of them has priced or passed, or for 24 hours
-- (sq_premium_reply_hours) if none of them has priced or messaged. That 24
-- hours was the customer's worst case; a member who got the text and did
-- nothing still cost them a day.
--
-- Now each member's own text is the clock. A premium offer whose invitation
-- text Twilio reported delivered (pending_sms.delivery_status, 20261006190000)
-- sq_premium_text_reply_hours (2) ago, with no tap on its link
-- (pending_sms.clicked_at) and the job never opened any other way
-- (job_invitations.opened_at), counts as passed for the window. When every
-- member has priced, passed, or sat on a delivered text, the window ends
-- through the existing route: open_submission_to_market('premium_untapped').
--
-- The invitation itself is left alone. The member can still open the job
-- and price it; they have simply stopped holding it. A member with no
-- phone, texts off, or a text that never got delivered is untouched by
-- this and still has the 24-hour rule.
-- ============================================================================

insert into app_config (key, value) values ('sq_premium_text_reply_hours', '2')
on conflict (key) do nothing;

-- True when this premium offer's invitation text was delivered at least
-- sq_premium_text_reply_hours ago and nobody tapped it or opened the job.
create or replace function public.sq_premium_text_untapped(p_invitation_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
      from job_invitations ji
      join pending_sms ps
        on ps.contractor_id = ji.contractor_id
       and ps.kind = 'sq_invitation'
       and ps.payload->>'submission_id' = ji.submission_id::text
     where ji.id = p_invitation_id
       and ji.premium_offer
       and ji.status = 'sent'
       and ji.opened_at is null
       and ps.delivery_status = 'delivered'
       and ps.clicked_at is null
       and ps.delivery_at
             <= now() - make_interval(hours => app_config_num('sq_premium_text_reply_hours', 2)::int)
  )
$function$;
revoke execute on function public.sq_premium_text_untapped(uuid) from public, anon, authenticated;
grant execute on function public.sq_premium_text_untapped(uuid) to service_role;

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
  for r in
    -- Branch A, unchanged: the contractor never priced it. Opens when their
    -- window lapses, when they decline, or when there is no preferred
    -- contractor to wait for.
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

    -- Branch B, new: they DID price it, and the customer has sat on it. Keyed
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
       -- Belt and braces. The status filter above already excludes an accepted
       -- job (accept moves it to accepted_awaiting_payment), but a job whose
       -- price the customer has taken must never be reopened under any
       -- ordering.
       and not exists (select 1 from client_quotes cq
                        where cq.submission_id = js.id
                          and cq.status = 'accepted')
       and js.accepted_client_quote_id is null

    union all

    -- Branch C: a premium window. Opens when it lapses, as soon as every
    -- premium member offered it has priced or passed, or after
    -- sq_premium_reply_hours with no member having priced or messaged. A
    -- member whose delivered text went untapped for sq_premium_text_reply_hours
    -- counts as passed (sq_premium_text_untapped): 'premium_untapped' when
    -- that is what ended the window.
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
