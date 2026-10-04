-- ============================================================================
-- Text messages to contractors.
--
-- Contractors read their email badly: 1,345 invitations in the last 30 days,
-- 514 opened. 266 of 272 have a UK mobile on file, so the messages that matter
-- most also go out by SMS:
--   sq_invitation             a new job to price
--   sq_award_won              the customer accepted their price
--   sq_message_to_contractor  the customer has written to them
--
-- How: an AFTER INSERT trigger on pending_emails copies those kinds into
-- pending_sms. Every emitter is untouched and the text follows the email's own
-- gating (notify_new_jobs, the bounced-address block, first refusal, test
-- mode), because no email means no text. The send-emails worker drains
-- pending_sms after the emails, through Twilio.
--
-- Webhook retries of a bounced email (retry_of is not null) are not texted
-- again. The trigger never blocks an email: any error is a warning.
--
-- Off by default: app_config.sq_sms_enabled = 0 queues nothing. Set it to 1
-- once the TWILIO_* secrets are on the edge function.
-- Contractors opt out on /account (contractors.notify_sms), or by replying
-- STOP, which the worker records against the same column.
-- ============================================================================

alter table public.contractors
  add column if not exists notify_sms boolean not null default true;

create table if not exists public.pending_sms (
  id uuid primary key default gen_random_uuid(),
  -- The email this text accompanies. Unique, so a re-fired trigger can't
  -- text twice.
  email_id uuid unique references public.pending_emails(id) on delete set null,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  kind text not null,
  to_phone text not null,
  payload jsonb not null default '{}'::jsonb,
  -- skipped = deliberately not sent (opted out, test mode, too old, not a
  -- mobile); failed = Twilio refused it or it ran out of attempts.
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_message_id text,
  detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists pending_sms_pending_idx
  on public.pending_sms (created_at) where status = 'pending';

-- Service role only: phone numbers and job details.
alter table public.pending_sms enable row level security;
revoke all on public.pending_sms from anon, authenticated;

insert into public.app_config (key, value)
values ('sq_sms_enabled', '0'::jsonb)
on conflict (key) do nothing;

create or replace function public.queue_contractor_sms()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_contractor record;
begin
  if new.retry_of is not null then
    return new;
  end if;
  if coalesce((select value::text from app_config where key = 'sq_sms_enabled'), '0') <> '1' then
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

  insert into pending_sms (email_id, contractor_id, kind, to_phone, payload)
  values (new.id, v_contractor.id, new.kind, v_contractor.phone, new.payload)
  on conflict (email_id) do nothing;
  return new;
exception when others then
  raise warning 'queue_contractor_sms failed for email %: %', new.id, sqlerrm;
  return new;
end;
$function$;

revoke all on function public.queue_contractor_sms() from public, anon, authenticated;

drop trigger if exists pending_emails_queue_sms on public.pending_emails;
create trigger pending_emails_queue_sms
  after insert on public.pending_emails
  for each row
  when (new.kind in ('sq_invitation', 'sq_award_won', 'sq_message_to_contractor'))
  execute function public.queue_contractor_sms();
