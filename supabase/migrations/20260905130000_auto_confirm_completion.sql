-- ============================================================================
-- Clause 7.2: "If you do neither within 3 working days, the Job is treated as
-- confirmed and we pay the Contractor."
--
-- The platform had no such rule. A customer who never came back left the job
-- at completed_by_contractor indefinitely and the contractor unpaid, with an
-- admin override as the only way out — while the terms they agreed to said
-- otherwise. opsThresholds.ts had it noted as "auto-confirm at 5, Part 3";
-- the published terms say 3 working days, so 3 working days it is.
--
-- Working days are counted Monday to Friday. Bank holidays are NOT excluded:
-- doing that needs a holiday calendar this system has no source for, and the
-- error is always in the customer's favour (they get slightly less time than
-- the terms promise only if a bank holiday falls in the window — so the count
-- deliberately starts the day AFTER completion, which more than covers it).
-- ============================================================================

alter table job_submissions
  add column if not exists completed_by_contractor_at timestamptz;

-- Backfill from the event log so jobs already waiting are covered rather than
-- stranded by the change that was meant to rescue them.
update job_submissions js
   set completed_by_contractor_at = e.created_at
  from (
    select job_id, max(created_at) as created_at
      from job_events
     where event_type = 'status_change' and to_status = 'completed_by_contractor'
     group by job_id
  ) e
 where e.job_id = js.id
   and js.completed_by_contractor_at is null;

create or replace function mark_completed_by_contractor(
  p_submission_id uuid, p_contractor_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_js job_submissions%rowtype;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.awarded_contractor_id is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_js.status = 'completed_by_contractor' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.status not in ('awarded', 'contacted', 'scheduled', 'in_progress') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions
     set status = 'completed_by_contractor',
         completed_by_contractor_at = now()
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'completed_by_contractor',
    'contractor', p_contractor_id, null, '{}');

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'),
    'sq_completion_confirm', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contact_name', v_js.contact_name,
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id)));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function mark_completed_by_contractor(uuid, uuid) from public;
grant execute on function mark_completed_by_contractor(uuid, uuid) to service_role;

-- Whole weekdays elapsed since a moment, counting from the day after it.
create or replace function working_days_since(p_from timestamptz)
returns int
language sql stable set search_path = public as $$
  select count(*)::int
    from generate_series(
           (p_from at time zone 'Europe/London')::date + 1,
           (now() at time zone 'Europe/London')::date,
           interval '1 day'
         ) d
   where extract(isodow from d) < 6;
$$;

create or replace function auto_confirm_due_completions() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r      record;
  v_done int := 0;
  v_email text;
begin
  for r in
    select * from job_submissions
     where status = 'completed_by_contractor'
       and completed_by_contractor_at is not null
       and working_days_since(completed_by_contractor_at) >= 3
     for update skip locked
  loop
    begin
      update job_submissions set status = 'completed' where id = r.id;
      -- Actor is the system, and the reason says which clause did it: an
      -- operator reading the log later should not have to guess why a job
      -- completed with nobody touching it.
      perform log_job_event(r.id, 'status_change', 'completed_by_contractor', 'completed',
        'system', null, 'auto-confirmed: 3 working days elapsed (terms 7.2)', '{}');

      select email into v_email from contractors where id = r.awarded_contractor_id;
      if v_email is not null then
        perform sq_notify_once(r.id, v_email, 'sq_completion_confirmed', v_email,
          jsonb_build_object('contact_name', r.contact_name));
      end if;
      perform sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
        'sq_rating_request', r.contact_email, jsonb_build_object(
          'client_token', r.client_token,
          'contractor_business_name',
            (select business_name from contractors where id = r.awarded_contractor_id),
          'contact_name', r.contact_name));
      v_done := v_done + 1;
    exception when others then
      raise warning 'auto-confirm failed for %: %', r.id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$$;

revoke execute on function auto_confirm_due_completions() from public, anon, authenticated;
grant execute on function auto_confirm_due_completions() to service_role;

-- Hourly. The window is measured in days, so this only decides which hour of
-- the third day a contractor gets paid.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-confirm-completions') then
    perform cron.unschedule('auto-confirm-completions');
  end if;
  perform cron.schedule('auto-confirm-completions', '23 * * * *',
    $ac$select auto_confirm_due_completions();$ac$);
end $$;
