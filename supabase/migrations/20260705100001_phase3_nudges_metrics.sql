-- ============================================================================
-- Phase 3 — closing-soon nudges + admin metrics (spec §9 Phase 3, §8).
-- ============================================================================

-- ── notify_closing_soon() (spec §4, §8) ─────────────────────────────────────
-- At T-4h, nudge matched contractors who HAVEN'T bid yet. Idempotent via the
-- job_notifications 'closing_soon' key, so a contractor is nudged at most once
-- per job even across cron ticks.
create or replace function notify_closing_soon()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  for r_job in
    select * from jobs
    where status = 'open'
      and bidding_closes_at <= now() + interval '4 hours'
      and bidding_closes_at > now()
  loop
    for r_ct in
      select distinct ct.id, ct.email
      from contractors ct
      join contractor_counties cc on cc.contractor_id = ct.id
      where cc.county_id = r_job.county_id
        and ct.status = 'approved'
        and ct.notify_new_jobs = true
        and not exists (
          select 1 from bids b where b.job_id = r_job.id and b.contractor_id = ct.id
        )
    loop
      insert into job_notifications (job_id, contractor_id, kind)
        values (r_job.id, r_ct.id, 'closing_soon')
        on conflict (job_id, contractor_id, kind) do nothing;
      if found then
        insert into pending_emails (kind, to_email, payload)
          values ('closing_soon', r_ct.email, jsonb_build_object(
            'job_id', r_job.id, 'title', r_job.title, 'town', r_job.town,
            'postcode_district', r_job.postcode_district, 'closes_at', r_job.bidding_closes_at));
      end if;
    end loop;
  end loop;
end;
$$;

revoke execute on function notify_closing_soon() from public;
grant execute on function notify_closing_soon() to service_role;

-- Add the nudge to the 5-minute tick.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'marketplace-tick') then
    perform cron.unschedule('marketplace-tick');
  end if;
  perform cron.schedule(
    'marketplace-tick',
    '*/5 * * * *',
    'select open_due_jobs(); select close_due_jobs(); select notify_closing_soon();'
  );
end $$;

-- ── admin_metrics() (spec §9 Phase 3) ───────────────────────────────────────
-- Fill rate, median bids per closed job, median time-to-first-bid, plus counts.
-- Service-role only (admin dashboard calls it via the service-role client).
create or replace function admin_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_jobs',            (select count(*) from jobs),
    'open_jobs',             (select count(*) from jobs where status = 'open'),
    'awarded_jobs',          (select count(*) from jobs where status in ('awarded','completed')),
    'expired_jobs',          (select count(*) from jobs where status = 'expired'),
    'withdrawn_jobs',        (select count(*) from jobs where status = 'withdrawn'),
    'contractors_total',     (select count(*) from contractors),
    'contractors_approved',  (select count(*) from contractors where status = 'approved'),
    'contractors_pending',   (select count(*) from contractors where status = 'pending'),
    'fill_rate', (
      select case when (a + e) = 0 then null else round(a::numeric / (a + e), 3) end
      from (select
        (select count(*) from jobs where status in ('awarded','completed')) a,
        (select count(*) from jobs where status = 'expired') e) x),
    'median_bids_per_closed_job', (
      select round((percentile_cont(0.5) within group (order by cnt))::numeric, 1)
      from (select (select count(*) from bids b where b.job_id = j.id)::double precision cnt
            from jobs j where j.status in ('awarded','completed','expired')) t),
    'median_hours_to_first_bid', (
      select round(((percentile_cont(0.5) within group (order by secs)) / 3600.0)::numeric, 1)
      from (select extract(epoch from (min(b.created_at) - j.created_at))::double precision secs
            from jobs j join bids b on b.job_id = j.id
            group by j.id, j.created_at) t)
  );
$$;

revoke execute on function admin_metrics() from public;
grant execute on function admin_metrics() to service_role;
