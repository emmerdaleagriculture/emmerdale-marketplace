-- ============================================================================
-- Scheduling (spec §4, verification §12.6.4).
-- One schedule every 5 minutes drives the job lifecycle state transitions.
-- Both functions only queue emails into pending_emails; a scheduled Edge
-- Function drains that queue via Resend, keeping these transitions network-free.
-- ============================================================================

create extension if not exists pg_cron;

-- Idempotent registration so re-running the migration doesn't duplicate the job.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'marketplace-tick') then
    perform cron.schedule(
      'marketplace-tick',
      '*/5 * * * *',
      $ct$select open_due_jobs(); select close_due_jobs();$ct$
    );
  end if;
end $$;
