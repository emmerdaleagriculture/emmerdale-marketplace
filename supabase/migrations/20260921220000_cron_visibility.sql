-- Making the scheduled work visible.
--
-- Ten jobs run this business on a timer and nothing lists them. Eight are
-- pg_cron and keep their own history in cron.job_run_details, which is in a
-- schema PostgREST cannot see. Two are Vercel Cron hitting /api/cron/*, and
-- those leave no trace anywhere at all: /api/cron/balances has been charging
-- balances since 10 September with no record that it ever ran, and a cron
-- silently unregistered looks exactly like a quiet week.
--
-- This session has been a catalogue of that failure mode — an errors page
-- blind for a fortnight, an email queue that would have reported `processed:0`
-- while draining nothing — so the scheduled jobs get the same treatment: a
-- place to record what happened, and a way to read it back.

-- ── Runs of the HTTP crons ───────────────────────────────────────────────
--
-- pg_cron already records itself. This is for the ones that do not: the route
-- writes a row when it starts and stamps the outcome when it finishes, so a
-- run that crashed halfway is distinguishable from one that never began — an
-- unfinished row is itself the signal.
create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  -- Matches the name in src/lib/cron/registry.ts, which is the list the admin
  -- page shows. A row whose name is not in that registry still displays, under
  -- its own name: a job nobody declared is worth seeing, not hiding.
  name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Null while running. False is a handler that threw.
  ok boolean,
  -- Whatever the handler wants to say about the run: {"chased": 3} and so on.
  detail jsonb,
  error text
);

comment on table cron_runs is
  'One row per invocation of an /api/cron/* route. pg_cron jobs record themselves in cron.job_run_details.';

-- The page asks for the newest few runs of one job, and the worker asks
-- whether anything is running now.
create index if not exists cron_runs_name_started_idx
  on cron_runs (name, started_at desc);

alter table cron_runs enable row level security;
-- No policies: the admin page reads with the service role, and nothing in the
-- browser has any business reading the schedule of the site's internals.

-- ── pg_cron, readable ────────────────────────────────────────────────────
--
-- SECURITY DEFINER because the cron schema belongs to postgres and is not
-- exposed through PostgREST, exactly as email_drain_health already does for
-- net._http_response.
create or replace function public.cron_jobs_health()
returns table (
  jobname text,
  schedule text,
  command text,
  active boolean,
  last_status text,
  last_start timestamptz,
  last_end timestamptz,
  last_message text,
  runs_24h bigint,
  failures_24h bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select j.jobname::text,
         j.schedule::text,
         left(j.command, 300)::text,
         j.active,
         d.status::text,
         d.start_time,
         d.end_time,
         left(coalesce(d.return_message, ''), 300)::text,
         coalesce(s.runs, 0),
         coalesce(s.failures, 0)
    from cron.job j
    -- The most recent attempt, which is what "is it working" actually asks.
    left join lateral (
      select r.status, r.start_time, r.end_time, r.return_message
        from cron.job_run_details r
       where r.jobid = j.jobid
       order by r.start_time desc
       limit 1
    ) d on true
    -- A day of context, so a job that fails one run in twenty is not read the
    -- same as one that has failed every time since a deploy.
    left join lateral (
      select count(*) as runs,
             count(*) filter (where r.status <> 'succeeded') as failures
        from cron.job_run_details r
       where r.jobid = j.jobid
         and r.start_time >= now() - interval '24 hours'
    ) s on true
   order by j.jobname;
$$;

revoke all on function public.cron_jobs_health() from public;
grant execute on function public.cron_jobs_health() to service_role;

-- ── Keep the new table from growing forever ──────────────────────────────
-- Same shape as the existing prune-page-events job. Scheduled rather than
-- folded into a handler so that pruning is itself a visible job.
select cron.schedule(
  'prune-cron-runs',
  '23 3 * * *',
  $$delete from cron_runs where started_at < now() - interval '30 days'$$
);
