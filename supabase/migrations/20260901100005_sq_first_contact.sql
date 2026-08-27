-- ============================================================================
-- First-contact obligation (spec v1.6 §25).
--
-- The winning contractor must contact the client within 24 hours of award
-- and log it — one tap, timestamped. The client has already paid in full;
-- silence after payment is the moment they conclude they've been taken.
-- awarded → contacted is the transition; time_to_first_contact lands in the
-- event metadata for the per-contractor supply-health view (§30).
-- ============================================================================

create or replace function log_first_contact(p_submission_id uuid, p_contractor_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_js job_submissions%rowtype;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.awarded_contractor_id is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if v_js.status = 'contacted' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.status <> 'awarded' then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions set status = 'contacted' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'awarded', 'contacted', 'contractor',
    p_contractor_id, null,
    jsonb_build_object('time_to_first_contact_seconds',
      extract(epoch from now() - v_js.awarded_at)::int));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function log_first_contact(uuid, uuid) from public;
grant execute on function log_first_contact(uuid, uuid) to service_role;
