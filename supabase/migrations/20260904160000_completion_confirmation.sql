-- ============================================================================
-- Close the awarded → completed loop (spec §25 lifecycle).
--
-- `completed_by_contractor` has existed in the status list since
-- 20260901100002 and is rendered in three places — /won, /admin/ops and the
-- client portal timeline — but nothing ever set it. Completion was an admin
-- action (mark_submission_completed) regardless of what either party thought,
-- so the two statuses either side of it were unreachable in practice.
--
-- Two functions close it, both shaped like log_first_contact (20260901100005):
--
--   mark_completed_by_contractor  the contractor says the work is done
--   confirm_completion_by_client  the client agrees, releasing the contractor
--
-- The admin override stays exactly as it is. That matters: a client who never
-- confirms would otherwise strand a contractor's payment indefinitely, so
-- mark_submission_completed remains the escape hatch and still accepts
-- `completed_by_contractor` as a starting status.
-- ============================================================================

-- ── Contractor: "I've finished" ─────────────────────────────────────────────
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
  -- Idempotent: a double tap is the same claim, not an error.
  if v_js.status = 'completed_by_contractor' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.status not in ('awarded', 'contacted', 'scheduled', 'in_progress') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions set status = 'completed_by_contractor' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'completed_by_contractor',
    'contractor', p_contractor_id, null, '{}');

  -- Without this the client is never prompted and the loop stalls here.
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

-- ── Client: "yes, it's done" ────────────────────────────────────────────────
create or replace function confirm_completion_by_client(p_submission_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status in ('completed', 'paid') then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  -- Only from completed_by_contractor: confirming means agreeing with the
  -- contractor's claim, so there has to be a claim to agree with. A client
  -- cannot close a job the contractor hasn't finished.
  if v_js.status <> 'completed_by_contractor' then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions set status = 'completed' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'completed_by_contractor', 'completed',
    'client', null, null, '{}');

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email, 'sq_completion_confirmed', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;

  -- Same rating request the admin path sends; sq_notify_once dedupes, so a
  -- later admin completion cannot double-send it.
  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'),
    'sq_rating_request', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id),
      'contact_name', v_js.contact_name));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function confirm_completion_by_client(uuid) from public;
grant execute on function confirm_completion_by_client(uuid) to service_role;
