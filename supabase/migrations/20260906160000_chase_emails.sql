-- ============================================================================
-- Two chases, for the two things that stall a finished job.
--
-- 1. The customer who hasn't confirmed. They get one email when the
--    contractor marks the work done, and then nothing until the job
--    auto-confirms at three working days (terms 7.2). If that first email was
--    missed, the money moves without them ever knowing they were asked. One
--    reminder on the second working day, while there is still a day left to
--    say something is wrong, is the difference between a deadline and an
--    ambush.
--
-- 2. The contractor who hasn't invoiced. The job is finished, the money is
--    held and the payout is owed; the only thing missing is their paperwork.
--    Nothing chased it, so a payment could sit indefinitely on something
--    nobody was looking at.
--
-- Both chase once and stop. A reminder that repeats is a reminder people
-- filter, and neither of these is urgent enough to spend that.
-- ============================================================================

create or replace function send_chase_emails() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r        record;
  v_email  text;
  v_confirm int := 0;
  v_invoice int := 0;
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
      -- sq_notify_once keys on (submission, recipient, kind), so the chase
      -- needs its own kind or the original confirm request would suppress it.
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
  -- Three working days after the job completed. Long enough not to nag
  -- somebody who is going to send it anyway on Friday night.
  for r in
    select * from job_submissions
     where status in ('completed', 'paid')
       and contractor_invoice_path is null
       and awarded_contractor_id is not null
       and completed_by_contractor_at is not null
       and working_days_since(completed_by_contractor_at) >= 3
  loop
    begin
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

-- Once a day, mid-morning: a chase that lands at 3am reads as a robot, and
-- both of these are asking a person to go and do something.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chase-emails') then
    perform cron.unschedule('chase-emails');
  end if;
  perform cron.schedule('chase-emails', '40 9 * * *',
    $ce$select send_chase_emails();$ce$);
end $$;
