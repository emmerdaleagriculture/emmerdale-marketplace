-- ============================================================================
-- Schedule the pending_emails drain (spec §4 — "a scheduled Edge Function
-- drains the queue via Resend"). pg_cron invokes the send-emails Edge Function
-- every minute via pg_net, passing the cron secret from Vault (never hardcoded).
--
-- Prerequisites (set up outside migrations, documented in README):
--   • Edge Function `send-emails` deployed
--   • Function secrets set: RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAILS, CRON_SECRET
--   • Vault secret `cron_secret` created with the same value as CRON_SECRET
-- ============================================================================

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'drain-emails') then
    perform cron.schedule(
      'drain-emails',
      '* * * * *',
      $ct$
        select net.http_post(
          url     := 'https://vonleampyheafgrkbbai.supabase.co/functions/v1/send-emails',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          body    := '{}'::jsonb
        );
      $ct$
    );
  end if;
end $$;
