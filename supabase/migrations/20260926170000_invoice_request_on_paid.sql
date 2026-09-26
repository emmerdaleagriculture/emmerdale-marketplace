-- Ask the contractor for their invoice the moment the customer has paid.
--
-- Until now the only ask was the chase, three working days after sign-off,
-- and the sign-off email only mentioned an invoice in passing. Tom's rule
-- (2026-09-26): the request goes as soon as the client has paid us in full,
-- i.e. when the balance settles. The chase stays as the reminder.
--
-- sq_settle_balance is the live definition with one block added, after the
-- customer's "paid in full" email. Nothing is sent if an invoice is already
-- on the job. sq_notify_once keys on (job, recipient, kind), so a settle
-- replayed by Stripe cannot send it twice.

CREATE OR REPLACE FUNCTION public.sq_settle_balance(p_payment_id uuid, p_intent_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pay job_payments%rowtype;
  v_js  job_submissions%rowtype;
  v_ct  contractors%rowtype;
  v_owed int;
begin
  select * into v_pay from job_payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  update job_payments
     set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_intent_id,
         last_error = null
   where id = p_payment_id;

  select * into v_js from job_submissions where id = v_pay.submission_id;
  perform log_job_event(v_pay.submission_id, 'payment_cleared', null, null, 'system', null,
    'balance settled', jsonb_build_object('amount_pence', v_pay.amount_pence, 'kind', 'balance'));

  -- 'paid' is the end of the customer's side of the job. Nothing has ever set
  -- it before now: under the old model the money was all in at award, so the
  -- status had nothing left to mark.
  if v_js.status = 'completed' then
    update job_submissions set status = 'paid' where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'completed', 'paid', 'system', null,
      'balance settled in full', '{}');
  end if;

  perform sq_notify_once(v_pay.submission_id, coalesce(v_js.contact_email, 'unknown'),
    'sq_balance_paid', v_js.contact_email, jsonb_build_object(
      'contact_name', v_js.contact_name,
      'amount_pence', v_pay.amount_pence,
      'price_basis',
        (select price_basis from client_quotes where id = v_pay.client_quote_id)));

  -- The customer has paid in full: ask the contractor for their invoice now.
  if v_js.awarded_contractor_id is not null and v_js.contractor_invoice_path is null then
    select * into v_ct from contractors where id = v_js.awarded_contractor_id;
    select cq.contractor_price_pence into v_owed
      from client_quotes clq
      join contractor_quotes cq on cq.id = clq.contractor_quote_id
     where clq.id = v_js.accepted_client_quote_id;
    if v_ct.email is not null then
      perform sq_notify_once(v_js.id, v_ct.email, 'sq_invoice_request', v_ct.email,
        jsonb_build_object(
          'contact_name', v_js.contact_name,
          'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
          'postcode_district', split_part(v_js.postcode, ' ', 1),
          'amount_pence', v_owed));
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;
