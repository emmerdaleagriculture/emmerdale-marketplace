-- ============================================================================
-- Clause 9.1: "You can cancel a Job at any time before the work starts, on
-- your Job page or by emailing us."
--
-- There was no cancel on the job page. Only an operator could cancel, and only
-- before distribution — so a customer who had already paid and wanted out had
-- no route at all except email, while the terms told them there was a button.
--
-- Self-service stops where judgement starts. 9.2 is arithmetic — 15% retained,
-- 85% back — and can be automated. 9.3 (cancelling after work has started:
-- "value of work done, plus 15% of the remainder") needs somebody to decide
-- what the work done is worth, so in_progress is deliberately excluded and
-- those customers are pointed at us rather than given a button that would
-- refund the wrong amount.
-- ============================================================================

alter table job_payments add column if not exists refunded_pence int;
alter table job_payments add column if not exists refunded_at timestamptz;

create or replace function cancel_job_by_client(
  p_submission_id uuid, p_refund_pence int, p_fee_pence int
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  -- Before the work starts, per 9.1. in_progress and everything after it needs
  -- 9.3's assessment, which is not a button.
  if v_js.status not in ('awarded', 'contacted', 'scheduled') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions set status = 'cancelled' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'cancelled', 'client', null,
    'cancelled on the job page (terms 9.1)',
    jsonb_build_object('refund_pence', p_refund_pence, 'fee_pence', p_fee_pence));

  update job_payments
     set status = 'partially_refunded',
         refunded_pence = p_refund_pence,
         refunded_at = now()
   where submission_id = v_js.id and status = 'paid';

  -- The contractor has been holding a date for this. Telling them is not
  -- optional, and it should not wait for someone to notice.
  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email, 'sq_job_cancelled_contractor', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;
  perform sq_notify_once(v_js.id, '__admin__', 'sq_job_cancelled_admin', '__admin__',
    jsonb_build_object('submission_id', v_js.id, 'refund_pence', p_refund_pence,
                       'fee_pence', p_fee_pence));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function cancel_job_by_client(uuid, int, int) from public, anon, authenticated;
grant execute on function cancel_job_by_client(uuid, int, int) to service_role;
