-- ============================================================================
-- Push first, text second.
--
-- Someone with the app on their phone used to get the push and the text for
-- the same thing at the same moment. Now the text waits for its push: until
-- the push has gone, then sq_push_first_minutes more. If the push is tapped
-- in that time, or (for an invitation) the job page is opened by any route,
-- the text is skipped. If the push fails, or has no device left, the text
-- goes at once. Nobody without the app is affected: queue_push only makes a
-- pending_push row for a user with a live device token.
--
-- How the wait is carried on pending_sms:
--   awaiting_push   set by queue_contractor_sms when a push row exists for
--                   the same email (queue_push runs first: AFTER triggers
--                   fire in name order, pending_emails_queue_push <
--                   pending_emails_queue_sms). The text is not due while set.
--   hold_until      set when the push settles, by the trigger below on
--                   pending_push leaving 'pending': sent → now() + the
--                   minutes, anything else → now(). Non-null means "this
--                   text had a push", which is when drainSms checks for a
--                   tap before sending.
--
-- The settling is a trigger rather than a call from the push drain so that
-- every way a push row leaves 'pending' (the drain, an admin fix, a future
-- second sender) releases its text, in the same transaction.
--
-- No fixed backstop: a text waits exactly as long as its own push. The push
-- drain gives up on a row after 3 attempts or 18 hours, and drainSms ignores
-- awaiting_push entirely in any run where the push drain could not run
-- (no FIREBASE_SERVICE_ACCOUNT, an unreadable one, a failed Google token),
-- so a broken push channel never holds texts.
--
-- Quiet hours: a push sent in the last minutes before 21:00 London releases
-- its text at once, rather than letting the wait carry it into the night and
-- out the next morning.
--
-- The premium two-hour rule (sq_premium_text_untapped) is unchanged: a tap on
-- the push opens the job page, which sets job_invitations.opened_at, which
-- the rule already reads.
--
-- Off switch: app_config.sq_push_first_minutes = 0 holds nothing.
-- ============================================================================

alter table public.pending_sms
  add column if not exists awaiting_push boolean not null default false,
  add column if not exists hold_until timestamptz;

insert into public.app_config (key, value)
values ('sq_push_first_minutes', '10'::jsonb)
on conflict (key) do nothing;

create or replace function public.queue_contractor_sms()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_contractor record;
  v_job record;
  v_await boolean;
begin
  if new.retry_of is not null then
    return new;
  end if;
  if coalesce((select value::text from app_config where key = 'sq_sms_enabled'), '0') <> '1' then
    return new;
  end if;

  -- A push for this same email: the text waits for it (see the header).
  v_await := app_config_num('sq_push_first_minutes', 10) > 0
             and exists (select 1 from pending_push where email_id = new.id and status = 'pending');

  if new.kind in ('sq_first_quote', 'sq_new_quotes', 'sq_message_to_client') then
    -- A customer email: the job is found by the portal token it links to.
    select js.id, js.sms_phone into v_job
      from job_submissions js
     where js.client_token = new.payload->>'client_token'
       and js.client_token_revoked_at is null
       and js.notify_sms
       and coalesce(trim(js.sms_phone), '') <> ''
     limit 1;
    if not found then
      return new;
    end if;
    insert into pending_sms (email_id, submission_id, kind, to_phone, payload, awaiting_push)
    values (new.id, v_job.id, new.kind, v_job.sms_phone, new.payload, v_await)
    on conflict (email_id) do nothing;
    return new;
  end if;

  select c.id, c.phone into v_contractor
    from contractors c
   where lower(c.email) = lower(new.to_email)
     and c.notify_sms
     and coalesce(trim(c.phone), '') <> ''
   order by c.created_at
   limit 1;
  if not found then
    return new;
  end if;

  insert into pending_sms (email_id, contractor_id, kind, to_phone, payload, awaiting_push)
  values (new.id, v_contractor.id, new.kind, v_contractor.phone, new.payload, v_await)
  on conflict (email_id) do nothing;
  return new;
exception when others then
  raise warning 'queue_contractor_sms failed for email %: %', new.id, sqlerrm;
  return new;
end;
$function$;

-- A push has left 'pending': release the text that waited for it.
create or replace function public.pending_push_settle_sms()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_until timestamptz := now();
  v_local timestamp;
  v_now_local timestamp := now() at time zone 'Europe/London';
begin
  if new.email_id is null then
    return new;
  end if;
  if new.status = 'sent' then
    v_until := now() + make_interval(mins => greatest(app_config_num('sq_push_first_minutes', 10), 0)::int);
    v_local := v_until at time zone 'Europe/London';
    -- Sent in the day but the wait would end in quiet hours (21:00–07:59):
    -- the text goes now, not tomorrow.
    if extract(hour from v_now_local) between 8 and 20
       and (extract(hour from v_local) not between 8 and 20 or v_local::date <> v_now_local::date) then
      v_until := now();
    end if;
  end if;
  update pending_sms
     set awaiting_push = false,
         hold_until = v_until
   where email_id = new.email_id
     and status = 'pending'
     and awaiting_push;
  return new;
end;
$function$;

revoke all on function public.pending_push_settle_sms() from public, anon, authenticated;

drop trigger if exists pending_push_settle_sms on public.pending_push;
create trigger pending_push_settle_sms
  after update of status on public.pending_push
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function public.pending_push_settle_sms();

create index if not exists pending_sms_awaiting_push_idx
  on public.pending_sms (email_id) where awaiting_push;
