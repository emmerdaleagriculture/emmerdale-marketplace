-- ============================================================================
-- notify_job_open(): queue free-tier "new job" notifications for an OPEN job,
-- idempotently (job_notifications PK). Factored out so BOTH paths can use it:
--   - open_due_jobs() when it flips exclusive → open (Phase 4 head-start path)
--   - the admin intake when it creates a job directly as 'open' (pre-Phase-4,
--     acceptance #15 — jobs skip the exclusive state entirely)
-- ============================================================================

create or replace function notify_job_open(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r_job record; r_ct record;
begin
  select * into r_job from jobs where id = p_job_id;
  if r_job.id is null or r_job.status <> 'open' then return; end if;

  for r_ct in
    select distinct ct.id, ct.email
    from contractors ct
    join contractor_counties cc on cc.contractor_id = ct.id
    where cc.county_id = r_job.county_id
      and ct.status = 'approved'
      and ct.notify_new_jobs = true
  loop
    insert into job_notifications (job_id, contractor_id, kind)
      values (r_job.id, r_ct.id, 'new_job')
      on conflict (job_id, contractor_id, kind) do nothing;
    if found then
      insert into pending_emails (kind, to_email, payload)
        values ('new_job', r_ct.email, jsonb_build_object(
          'job_id', r_job.id, 'contractor_id', r_ct.id,
          'title', r_job.title, 'town', r_job.town,
          'postcode_district', r_job.postcode_district,
          'county_id', r_job.county_id, 'closes_at', r_job.bidding_closes_at));
    end if;
  end loop;
end;
$$;

revoke execute on function notify_job_open(uuid) from public;

-- Refactor open_due_jobs to reuse the shared notifier.
create or replace function open_due_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare r_job record;
begin
  for r_job in
    select id from jobs
    where status = 'exclusive' and bidding_opens_at <= now()
    for update skip locked
  loop
    update jobs set status = 'open' where id = r_job.id;
    perform notify_job_open(r_job.id);
  end loop;
end;
$$;

revoke execute on function open_due_jobs() from public;
