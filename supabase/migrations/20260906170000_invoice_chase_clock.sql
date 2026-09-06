-- ============================================================================
-- The invoice chase was counting from the wrong moment.
--
-- It measured three working days from completed_by_contractor_at — the day
-- the CONTRACTOR marked the work done. But auto-confirm carries a job to
-- 'completed' at exactly three working days from that same timestamp, so the
-- chase fired on the very day the job completed: "where is your invoice for
-- the job that finished this morning".
--
-- The clock that matters starts when the job actually completed, which is
-- recorded in job_events, not on the row. Three working days from there.
-- ============================================================================

create or replace function send_chase_emails() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r          record;
  v_email    text;
  v_done_at  timestamptz;
  v_confirm  int := 0;
  v_invoice  int := 0;
begin
  -- ── 1. Customer has not confirmed ──────────────────────────────────────
  -- Two working days in, one before auto-confirm carries it.
  for r in
    select * from job_submissions
     where status = 'completed_by_contractor'
       and completed_by_contractor_at is not null
       and working_days_since(completed_by_contractor_at) >= 2
       and contact_email is not null
  loop
    begin
      perform sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
        'sq_completion_confirm_chase', r.contact_email,
        jsonb_build_object(
          'client_token', r.client_token,
          'contact_name', r.contact_name,
          'contractor_business_name',
            (select business_name from contractors where id = r.awarded_contractor_id)));
      v_confirm := v_confirm + 1;
    exception when others then
      raise warning 'confirm chase failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ── 2. Contractor has not invoiced ─────────────────────────────────────
  for r in
    select * from job_submissions
     where status in ('completed', 'paid')
       and contractor_invoice_path is null
       and awarded_contractor_id is not null
  loop
    begin
      -- When the job actually completed, however it got there: the customer
      -- confirming, auto-confirm, or an operator. A job with no such event is
      -- left alone rather than chased off a guess.
      select max(created_at) into v_done_at
        from job_events
       where job_id = r.id and to_status in ('completed', 'paid');
      continue when v_done_at is null or working_days_since(v_done_at) < 3;

      select email into v_email from contractors where id = r.awarded_contractor_id;
      if v_email is not null then
        perform sq_notify_once(r.id, v_email, 'sq_invoice_chase', v_email,
          jsonb_build_object(
            'contact_name', r.contact_name,
            'service', coalesce((select name from services where id = r.service_id),
                                r.service_verbatim),
            'postcode_district', split_part(r.postcode, ' ', 1)));
        v_invoice := v_invoice + 1;
      end if;
    exception when others then
      raise warning 'invoice chase failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('confirm_chases', v_confirm, 'invoice_chases', v_invoice);
end;
$$;

revoke execute on function send_chase_emails() from public, anon, authenticated;
grant execute on function send_chase_emails() to service_role;
