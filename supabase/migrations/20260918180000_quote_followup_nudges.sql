-- ============================================================================
-- Two follow-ups for a customer sitting on their prices.
--
-- Day 3 is a full note from Tom — how the platform works, what the deposit
-- buys, and an offer to talk it through. Day 6 is a short nudge. Both stop the
-- moment a price is accepted: the status guard below leaves the window the
-- instant the job moves to accepted_awaiting_payment.
--
-- CALENDAR days, not working days (Tom's call). The existing chases in this
-- function use working_days_since because an invoice or a sign-off is somebody
-- doing a job; deciding between quotes is not, and a customer who got prices on
-- Friday should hear on Monday rather than Wednesday.
--
-- Clock runs from quotes_notified_at — when the prices were SENT. The same
-- moment the 48-hour first-refusal window uses, so the two cannot disagree
-- about when the customer "got" their prices.
--
-- Dedupe is free: submission_notifications is keyed (submission_id, recipient,
-- kind), and these are two distinct kinds, so each customer gets each once
-- however often the cron runs.
--
-- Deliberately retrospective (Tom's call): a job already past day 3 when this
-- ships gets its day-3 note on the first run rather than being skipped.
-- ============================================================================

create or replace function send_chase_emails() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r          record;
  v_email    text;
  v_done_at  timestamptz;
  v_confirm  int := 0;
  v_invoice  int := 0;
  v_nudge1   int := 0;
  v_nudge2   int := 0;
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

  -- ── 3 & 4. Customer has prices and has not chosen ──────────────────────
  -- One pass, two thresholds. The status guard is what stops these the moment
  -- a price is taken: accepting moves the job out of quotes_receiving, so an
  -- accepted job can never be nudged even if the cron runs a second later.
  --
  -- `service` carries the verbatim fallback because service_id is null on
  -- nearly every submission since routing went county-only (8e86e71) — without
  -- it the copy reads "the quote(s) you got for ." to a real customer.
  for r in
    select js.*,
           (now()::date - js.quotes_notified_at::date) as days_since,
           -- The classified service name when there is one. Otherwise "your
           -- job" — NOT the verbatim description. The description is the
           -- customer's own paragraph and routinely runs to 300 characters;
           -- dropped into "your price for …" it reads as a mangled sentence.
           -- A short true phrase beats a long accurate one here.
           coalesce((select name from services where id = js.service_id),
                    'your job') as service_label,
           (select count(*) from client_quotes cq
             where cq.submission_id = js.id and cq.status = 'active') as quote_count,
           -- The copy says "a N% deposit". Carried in the payload so the email
           -- follows sq_deposit_rate instead of quietly lying if it changes.
           round(app_config_num('sq_deposit_rate', 0.15) * 100)::int as deposit_pct
      from job_submissions js
     where js.status = 'quotes_receiving'
       and js.quotes_notified_at is not null
       and js.contact_email is not null
       and js.accepted_client_quote_id is null
       -- There must actually be a price to chase.
       and exists (select 1 from client_quotes cq
                    where cq.submission_id = js.id and cq.status = 'active')
  loop
    begin
      if r.days_since >= 6 then
        if sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
             'sq_quotes_nudge_2', r.contact_email,
             jsonb_build_object(
               'client_token', r.client_token,
               'contact_name', r.contact_name,
               'service', r.service_label,
               'quote_count', r.quote_count,
               'deposit_pct', r.deposit_pct))
        then v_nudge2 := v_nudge2 + 1; end if;
      end if;

      -- Not elsif: a job first seen at day 7+ should get the fuller day-3 note
      -- as well, since it never received one. sq_notify_once keeps each to one.
      if r.days_since >= 3 then
        if sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
             'sq_quotes_nudge_1', r.contact_email,
             jsonb_build_object(
               'client_token', r.client_token,
               'contact_name', r.contact_name,
               'service', r.service_label,
               'quote_count', r.quote_count,
               'deposit_pct', r.deposit_pct))
        then v_nudge1 := v_nudge1 + 1; end if;
      end if;
    exception when others then
      raise warning 'quote nudge failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'confirm_chases', v_confirm,
    'invoice_chases', v_invoice,
    'quote_nudge_day3', v_nudge1,
    'quote_nudge_day6', v_nudge2);
end;
$$;
