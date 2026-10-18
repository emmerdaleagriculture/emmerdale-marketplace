-- ============================================================================
-- Push notifications for the apps (PRD task 7).
--
-- A third channel beside email and text. device_tokens holds each phone's
-- FCM token for the person signed in on it; pending_push is the queue. An
-- AFTER INSERT trigger on pending_emails copies the kinds that matter into
-- pending_push for anyone who has a live device, exactly as
-- pending_emails_queue_sms does for texts: every emitter is untouched, and
-- the push follows the email's own gating (opt-outs, bounced addresses,
-- first refusal, test mode), because no email means no push. The
-- send-emails worker drains it after the texts, through FCM HTTP v1
-- (supabase/functions/send-emails/push.ts), rendering the title and body
-- there, as it does for texts.
--
-- Who the push is for:
--   contractor kinds   the contractors row whose email the mail went to
--   customer kinds     the job's customer (job_submissions.customer_id, via
--                      the client_token in the payload); a customer without
--                      an account has no app to push to
--
-- Taps: each push carries /t/<link_code>, the same short link a text does,
-- so sms_link_hit now answers for either table. Tapping the link opens the
-- job page, which sets job_invitations.opened_at — so a premium invitation
-- opened from a push counts as tapped for the two-hour rule
-- (sq_premium_text_untapped checks opened_at) without any further change.
--
-- Off switch: app_config.sq_push_enabled = 0 queues nothing.
-- ============================================================================

create table if not exists public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android', 'web')),
  token         text not null unique,
  app_version   text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists device_tokens_user_live_idx
  on public.device_tokens (user_id) where revoked_at is null;

alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from public, anon, authenticated;
grant all on public.device_tokens to service_role;

create table if not exists public.pending_push (
  id            uuid primary key default gen_random_uuid(),
  -- The email this push accompanies. Unique, so a re-fired trigger can't
  -- push twice.
  email_id      uuid unique references public.pending_emails(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  to_email      text not null,
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  -- Set by the worker when it sends: what it said and where the tap goes.
  title         text,
  body          text,
  link          text,
  link_code     text unique,
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts      integer not null default 0,
  detail        text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  clicked_at    timestamptz,
  clicks        integer not null default 0
);
create index if not exists pending_push_pending_idx
  on public.pending_push (created_at) where status = 'pending';
create index if not exists pending_push_user_idx on public.pending_push (user_id, created_at);

alter table public.pending_push enable row level security;
revoke all on public.pending_push from public, anon, authenticated;
grant all on public.pending_push to service_role;

insert into public.app_config (key, value)
values ('sq_push_enabled', '1'::jsonb)
on conflict (key) do nothing;

create or replace function public.queue_push()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid;
begin
  if new.retry_of is not null then
    return new;
  end if;
  if coalesce((select value::text from app_config where key = 'sq_push_enabled'), '1') <> '1' then
    return new;
  end if;

  if new.kind in ('sq_first_quote', 'sq_new_quotes', 'sq_message_to_client',
                  'sq_completion_confirm', 'sq_quotes_nudge_1', 'sq_quotes_nudge_2') then
    select js.customer_id into v_user
      from job_submissions js
     where js.client_token = new.payload->>'client_token'
       and js.client_token_revoked_at is null
       and js.customer_id is not null
     limit 1;
  else
    select c.id into v_user
      from contractors c
     where lower(c.email) = lower(new.to_email)
     order by c.created_at
     limit 1;
  end if;
  if v_user is null then
    return new;
  end if;

  -- Only for someone with a phone to push to.
  if not exists (select 1 from device_tokens where user_id = v_user and revoked_at is null) then
    return new;
  end if;

  insert into pending_push (email_id, user_id, to_email, kind, payload)
  values (new.id, v_user, new.to_email, new.kind, new.payload)
  on conflict (email_id) do nothing;
  return new;
exception when others then
  raise warning 'queue_push failed for email %: %', new.id, sqlerrm;
  return new;
end;
$function$;

revoke all on function public.queue_push() from public, anon, authenticated;

drop trigger if exists pending_emails_queue_push on public.pending_emails;
create trigger pending_emails_queue_push
  after insert on public.pending_emails
  for each row
  when (new.kind in ('sq_invitation', 'sq_award_won', 'sq_message_to_contractor',
                     'sq_payout_sent', 'application_approved',
                     'sq_first_quote', 'sq_new_quotes', 'sq_message_to_client',
                     'sq_completion_confirm', 'sq_quotes_nudge_1', 'sq_quotes_nudge_2'))
  execute function public.queue_push();

-- /t/<code> now answers for a push's link as well as a text's.
create or replace function public.sms_link_hit(p_code text, p_count boolean default true)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_link text;
begin
  if p_count then
    update pending_sms
       set clicks = clicks + 1,
           clicked_at = coalesce(clicked_at, now())
     where link_code = p_code
    returning link into v_link;
    if v_link is null then
      update pending_push
         set clicks = clicks + 1,
             clicked_at = coalesce(clicked_at, now())
       where link_code = p_code
      returning link into v_link;
    end if;
  else
    select link into v_link from pending_sms where link_code = p_code;
    if v_link is null then
      select link into v_link from pending_push where link_code = p_code;
    end if;
  end if;
  return v_link;
end;
$function$;
