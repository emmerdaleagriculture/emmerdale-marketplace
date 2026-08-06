-- ============================================================================
-- Member-posted jobs: any signed-in user can post a job for admin review.
--
-- New job status 'pending' — a job submitted from /jobs/new sits there until
-- admin approves (→ 'open', network notified) or rejects (→ 'withdrawn').
-- public_jobs and open_job() already admit only 'open'/'exclusive', so a
-- pending job is invisible to the network with no further changes.
-- ============================================================================

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('pending','exclusive','open','withdrawn','completed'));

-- ── admin_metrics(): surface the review queue ───────────────────────────────
create or replace function admin_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_jobs',            (select count(*) from jobs),
    'pending_jobs',          (select count(*) from jobs where status = 'pending'),
    'open_jobs',             (select count(*) from jobs where status = 'open'),
    'completed_jobs',        (select count(*) from jobs where status = 'completed'),
    'withdrawn_jobs',        (select count(*) from jobs where status = 'withdrawn'),
    'job_opens',             (select count(*) from contact_reveals),
    'contractors_total',     (select count(*) from contractors),
    'contractors_approved',  (select count(*) from contractors where status = 'approved'),
    'contractors_pending',   (select count(*) from contractors where status = 'pending')
  );
$$;
revoke execute on function admin_metrics() from public;
grant execute on function admin_metrics() to service_role;
