-- ============================================================================
-- Make the pending_emails drain portable across Supabase projects.
--
-- 20260704200010 baked this project's ref straight into the cron command:
--   url := 'https://<ref>.supabase.co/functions/v1/send-emails'
-- so the moment the app moves to a new Supabase project, the scheduler on the
-- new project keeps POSTing at the OLD one — which still answers, still drains
-- its own queue, and gives no visible error. The URL now lives in Vault next to
-- cron_secret, and the cron job calls one function instead of inlining SQL.
--
-- 20260704200010 was edited in the same change to stop hardcoding the ref, so a
-- from-scratch `supabase db push` never plants the old URL. That file is already
-- recorded as applied on the live project, so it does not re-run there.
--
-- New-project checklist — both secrets must exist before the first tick:
--   select vault.create_secret('https://<new-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<CRON_SECRET>',                 'cron_secret');
-- ============================================================================

create or replace function public.drain_emails_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base   text;
  secret text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';

  if base is null or base = '' then
    raise exception 'vault secret "project_url" is not set — the email drain has no send-emails URL to call';
  end if;
  if secret is null or secret = '' then
    raise exception 'vault secret "cron_secret" is not set — send-emails would reject the call';
  end if;

  return net.http_post(
    url     := rtrim(base, '/') || '/functions/v1/send-emails',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- Scheduler-only. Nothing reachable from the Data API should be able to spend
-- pg_net requests or observe the cron secret's effects.
revoke all on function public.drain_emails_tick() from public, anon, authenticated;

-- Self-heal the live project: it already has the job with the URL inlined, so
-- lift the ref out of the command rather than making the operator retype it.
-- A brand-new project has no URL to lift (20260704200010 no longer carries one),
-- leaving the secret to the checklist above.
do $$
declare
  cmd  text;
  base text;
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    select command into cmd from cron.job where jobname = 'drain-emails';
    base := substring(cmd from 'https://[a-z0-9]+\.supabase\.co');
    if base is not null then
      perform vault.create_secret(base, 'project_url');
    end if;
  end if;
end $$;

-- Re-schedule with the unschedule-then-schedule idiom (20260724120000).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'drain-emails') then
    perform cron.unschedule('drain-emails');
  end if;
  perform cron.schedule('drain-emails', '* * * * *', 'select public.drain_emails_tick();');
end $$;
