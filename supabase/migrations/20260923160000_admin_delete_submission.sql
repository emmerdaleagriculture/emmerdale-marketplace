-- ============================================================================
-- Let an operator delete a job outright.
--
-- Cancelling keeps a job (and its audit trail) forever, which is right for a
-- real job and wrong for a test one: a cancelled test still counts in the
-- admin boards and sits in the database looking like a customer. Deleting by
-- hand meant knowing the eight tables that point at job_submissions, in the
-- order their foreign keys demand.
--
-- REFUSED once money or an award is involved. Anything that has reached
-- accepted_awaiting_payment or beyond — or has a job_payments row at all — is
-- a financial record, and a delete would take the payment trail with it.
-- Those can still be cancelled.
--
-- Pending emails about the job are dropped too: sent after the delete they
-- would carry links to a job that no longer exists. Sent ones stay as the
-- record of what went out. Leads that were published into this job are
-- unlinked, not deleted — the enquiry was real even if the job was not.
-- ============================================================================

create or replace function admin_delete_submission(p_submission_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_status text;
  v_photos text[];
begin
  select status, photo_paths into v_status, v_photos
    from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if v_status not in ('draft', 'confirmed', 'abandoned', 'distributed', 'quotes_receiving',
                      'cancelled', 'no_matches', 'no_quotes', 'expired') then
    return jsonb_build_object('ok', false, 'reason', 'status', 'status', v_status);
  end if;
  if exists (select 1 from job_payments where submission_id = p_submission_id) then
    return jsonb_build_object('ok', false, 'reason', 'payments', 'status', v_status);
  end if;

  delete from pending_emails
   where status = 'pending' and payload->>'submission_id' = p_submission_id::text;
  update leads set submission_id = null where submission_id = p_submission_id;
  delete from contractor_ratings       where submission_id = p_submission_id;
  delete from client_quotes            where submission_id = p_submission_id;
  delete from contractor_quotes        where submission_id = p_submission_id;
  delete from job_invitations          where submission_id = p_submission_id;
  delete from submission_notifications where submission_id = p_submission_id;
  delete from job_events               where job_id        = p_submission_id;
  delete from job_submission_parses    where submission_id = p_submission_id;
  delete from job_submissions          where id            = p_submission_id;

  return jsonb_build_object('ok', true, 'status', v_status,
                            'photo_paths', coalesce(to_jsonb(v_photos), '[]'::jsonb));
end;
$$;

-- `revoke … from public` alone is a no-op here: default privileges grant
-- anon and authenticated directly (20260922…, PostgREST exposure fix).
revoke all on function admin_delete_submission(uuid) from public, anon, authenticated;
grant execute on function admin_delete_submission(uuid) to service_role;
