-- ============================================================================
-- One reminder to a customer who hasn't read a contractor's message.
--
-- A message emails the other side as it arrives (sq_message_alert), and
-- that is all. A contractor who doesn't read theirs is picked up by the
-- Monday round-up. A customer who doesn't read theirs got nothing more: the
-- contractor's question ("what seed?", "can I see the site?") sat unanswered
-- and the job went quiet. The customer is the side that only half-expects
-- mail from us and the most likely to miss the first one.
--
-- Who: a customer with a contractor message that is still unread
-- sq_message_reminder_hours after it was sent, in a thread that is still
-- open (sq_thread_state is not 'closed': a lost or withdrawn job is not
-- worth chasing). Held and rejected messages never reached the customer and
-- don't count; every other message did, alone or folded into an earlier
-- email by sq_message_alert's half-hour batching. The four-day floor stops the
-- first run after this deploy from chasing old threads.
--
-- One email per job, naming every contractor waiting on them. Once per
-- unread run: the key is the newest "oldest unread message" among the
-- overdue threads. The next tick finds the same key and sends nothing; a
-- thread that becomes overdue later has a newer oldest-unread message and so
-- a new key, and that email lists everything still waiting. Reading the
-- thread resets it, so a later unanswered message can be chased again.
--
-- Sent between 08:00 and 20:00 UK time: nobody wants a nudge at 3am.
-- ============================================================================

insert into app_config (key, value) values ('sq_message_reminder_hours', '24')
on conflict (key) do nothing;

create or replace function sq_message_reminder_tick() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r        record;
  v_n      int := 0;
  v_hours  int := app_config_num('sq_message_reminder_hours', 24)::int;
  v_local  int := extract(hour from now() at time zone 'Europe/London')::int;
begin
  if v_local < 8 or v_local >= 20 then return 0; end if;

  for r in
    with unread as (
      select m.submission_id, m.invitation_id, m.id, m.body, m.photo_paths, m.phase, m.created_at,
             first_value(m.id) over w as oldest_id,
             min(m.created_at) over (partition by m.invitation_id) as oldest_at
        from job_messages m
       where m.sender = 'contractor'
         and m.read_at is null
         and coalesce(m.moderation, 'approved') = 'approved'
      window w as (partition by m.invitation_id order by m.created_at)
    ),
    threads as (
      select u.submission_id, u.invitation_id, u.oldest_id, u.oldest_at,
             count(*) as n,
             string_agg(
               concat_ws(E'\n',
                 nullif(u.body, ''),
                 case cardinality(u.photo_paths)
                   when 0 then null
                   when 1 then '[Sent a photo — open the page to see it]'
                   else '[Sent ' || cardinality(u.photo_paths) || ' photos — open the page to see them]'
                 end),
               E'\n\n' order by u.created_at) as text,
             bool_or(u.phase = 'post_award') as post_award
        from unread u
       group by u.submission_id, u.invitation_id, u.oldest_id, u.oldest_at
      having u.oldest_at <= now() - make_interval(hours => v_hours)
         and u.oldest_at >  now() - interval '4 days'
    )
    select js.id as submission_id, js.contact_email, js.client_token,
           sq_service_label(js.service_id, js.service_verbatim) as service,
           (array_agg(t.oldest_id order by t.oldest_at desc))[1] as key_id,
           jsonb_agg(jsonb_build_object(
             'from', case when t.post_award then ct.business_name else ji.display_label end,
             'count', t.n,
             'since', t.oldest_at,
             'body', t.text) order by t.oldest_at) as threads
      from threads t
      join job_invitations ji on ji.id = t.invitation_id
      join contractors ct on ct.id = ji.contractor_id
      join job_submissions js on js.id = t.submission_id
     where js.contact_email is not null
       and sq_thread_state(t.invitation_id) <> 'closed'
     group by js.id
  loop
    if sq_notify_once(r.submission_id, r.contact_email || ':msgrem:' || r.key_id,
         'sq_message_reminder_to_client', r.contact_email,
         jsonb_build_object('service', r.service, 'client_token', r.client_token,
                            'threads', r.threads)) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function sq_message_reminder_tick() from public, anon, authenticated;

-- Hourly at :25 UTC across the UK day; the function itself enforces 08–20
-- London, so the schedule only has to cover both BST and GMT.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'message-reminders') then
    perform cron.unschedule('message-reminders');
  end if;
  perform cron.schedule('message-reminders', '25 6-20 * * *', $c$select sq_message_reminder_tick();$c$);
end $$;
