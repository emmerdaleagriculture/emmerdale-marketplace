-- sq_start_job (20261018210000) changed the status without the status_change
-- event every other contractor transition writes; the admin timeline missed
-- the step. Same function, with the event.
create or replace function public.sq_start_job(p_submission_id uuid, p_contractor_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status text;
begin
  select status into v_status
    from job_submissions
   where id = p_submission_id and awarded_contractor_id = p_contractor_id
   for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_status = 'in_progress' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_status not in ('awarded', 'contacted', 'scheduled') then
    return jsonb_build_object('ok', false, 'reason', 'status:' || v_status);
  end if;
  update job_submissions set status = 'in_progress' where id = p_submission_id;
  perform log_job_event(p_submission_id, 'status_change', v_status, 'in_progress', 'contractor', p_contractor_id,
                        'started_in_app', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$function$;
