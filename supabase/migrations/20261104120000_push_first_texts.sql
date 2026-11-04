-- ============================================================================
-- Push first, text second.
--
-- Someone with the app on their phone used to get the push and the text for
-- the same thing at the same moment. Now the text waits: until the push has
-- gone, then sq_push_first_minutes more. If the push is tapped in that time,
-- or (for an invitation) the job page is opened by any route, the text is
-- skipped. If the push fails, or has no device left, the text goes at once.
-- Nobody without the app is affected: queue_push only makes a pending_push
-- row for a user with a live device token.
--
-- How the hold is carried: pending_sms.hold_until.
--   queue_contractor_sms   a push row exists for this email (queue_push runs
--                          first: AFTER triggers fire in name order, and
--                          pending_emails_queue_push < pending_emails_queue_sms)
--                          → hold_until = now() + 30 minutes, a backstop so
--                          a stuck push can't hold the text for good
--   sq_sms_after_push      called by the send-emails push drain on a push's
--                          final outcome: sent → hold_until = now() + the
--                          minutes; failed/skipped → hold_until = null
--   drainSms               sends only rows whose hold has passed, and skips a
--                          held text whose push was tapped or job opened.
--                          With no FIREBASE_SERVICE_ACCOUNT set it ignores
--                          hold_until entirely, so nothing waits on a push
--                          that cannot be sent.
--
-- The premium two-hour rule (sq_premium_text_untapped) is unchanged: a tap on
-- the push opens the job page, which sets job_invitations.opened_at, which
-- the rule already reads; a text skipped for that reason was never needed.
--
-- Off switch: app_config.sq_push_first_minutes = 0 holds nothing.
-- ============================================================================

alter table public.pending_sms add column if not exists hold_until timestamptz;

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
  v_hold timestamptz;
begin
  if new.retry_of is not null then
    return new;
  end if;
  if coalesce((select value::text from app_config where key = 'sq_sms_enabled'), '0') <> '1' then
    return new;
  end if;

  -- A push for this same email: the text waits for it (see the header).
  if app_config_num('sq_push_first_minutes', 10) > 0
     and exists (select 1 from pending_push where email_id = new.id) then
    v_hold := now() + interval '30 minutes';
  end if;

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
    insert into pending_sms (email_id, submission_id, kind, to_phone, payload, hold_until)
    values (new.id, v_job.id, new.kind, v_job.sms_phone, new.payload, v_hold)
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

  insert into pending_sms (email_id, contractor_id, kind, to_phone, payload, hold_until)
  values (new.id, v_contractor.id, new.kind, v_contractor.phone, new.payload, v_hold)
  on conflict (email_id) do nothing;
  return new;
exception when others then
  raise warning 'queue_contractor_sms failed for email %: %', new.id, sqlerrm;
  return new;
end;
$function$;

-- The push drain reports a push's final outcome. Sent: the text waits the
-- configured minutes from now. Not sent: the text is released at once.
create or replace function public.sq_sms_after_push(p_email_id uuid, p_sent boolean)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update pending_sms
     set hold_until = case
           when p_sent then now() + make_interval(mins => app_config_num('sq_push_first_minutes', 10)::int)
           else null
         end
   where email_id = p_email_id
     and status = 'pending'
     and hold_until is not null;
$function$;

revoke all on function public.sq_sms_after_push(uuid, boolean) from public, anon, authenticated;
grant execute on function public.sq_sms_after_push(uuid, boolean) to service_role;
