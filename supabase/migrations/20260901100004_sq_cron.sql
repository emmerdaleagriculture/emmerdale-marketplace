-- ============================================================================
-- Sealed-quote funnel: schedule the sweep.
--
-- marketplace-tick gains sealed_quote_tick() alongside the open-access
-- board's open_due_jobs(). Re-scheduling an existing job uses the
-- unschedule-then-schedule idiom (20260724120000). drain-emails (1 min) is
-- untouched — a full invitation fan-out drains in a single batch of 50.
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'marketplace-tick') then
    perform cron.unschedule('marketplace-tick');
  end if;
  perform cron.schedule(
    'marketplace-tick',
    '*/5 * * * *',
    'select open_due_jobs(); select sealed_quote_tick();'
  );
end
$$;
