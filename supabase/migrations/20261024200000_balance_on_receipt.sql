-- ============================================================================
-- The balance is due on receipt.
--
-- Since 20260910120000 the balance request has given the customer
-- sq_balance_terms_days (7) to pay, and every email, the job page, the Stripe
-- line and the customer terms said so. The user's decision on 2026-10-24: no
-- time to pay. The balance falls due the moment the work is confirmed done
-- and the request goes out.
--
-- Mechanically that is sq_balance_terms_days = 0: sq_open_balance already
-- computes due_at as now() + the terms, and the copy (send-emails,
-- my/[token], the legal pages) reads the terms and says "on receipt" when
-- they are zero. Jobs whose balance was requested under the 7-day terms keep
-- their due_at; the customer terms say the version accepted applies.
--
-- One knock-on. sq_alert_overdue_balances told the admins about any balance
-- past due_at, which with due_at = now() is every balance on the next morning
-- run. "Overdue" now means sq_balance_overdue_grace_days (3) after the
-- request with the due date still passed: long enough for a bank transfer
-- to land, short enough to chase while the job is fresh. A balance still on
-- the old 7-day terms alerts the day after its due date, as before.
--
-- Two more places rendered the terms on the SQL side and are brought in
-- line below: the job event sq_open_balance writes ("within 0 days" is not
-- a sentence), and the deposit checkout email, whose payload never carried
-- the terms, so the renderer had to guess them.
-- ============================================================================

update app_config set value = '0' where key = 'sq_balance_terms_days';
insert into app_config (key, value) values ('sq_balance_overdue_grace_days', '3')
on conflict (key) do nothing;

CREATE OR REPLACE FUNCTION public.sq_alert_overdue_balances()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_n int := 0;
begin
  for r in
    select p.id, p.submission_id, p.amount_pence, p.due_at
      from job_payments p
     where p.kind = 'balance' and p.status in ('due', 'requested', 'failed')
       and p.due_at < now()
       and p.created_at < now() - make_interval(days => app_config_num('sq_balance_overdue_grace_days', 3)::int)
  loop
    if sq_notify_once(r.submission_id, '__admin__', 'sq_balance_overdue', '__admin__',
         jsonb_build_object('submission_id', r.submission_id,
                            'amount_pence', r.amount_pence, 'due_at', r.due_at)) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;

-- The deposit checkout email carries the terms, like the balance request does,
-- so the renderer reads them rather than guessing.
CREATE OR REPLACE FUNCTION public.begin_acceptance(p_client_token text, p_client_quote_id uuid, p_session_id text, p_session_expires_at timestamp with time zone, p_checkout_url text, p_deposit_pence integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js  job_submissions%rowtype;
  v_q   client_quotes%rowtype;
  v_dep int;
begin
  select * into v_js from job_submissions
   where client_token = p_client_token and client_token_revoked_at is null
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status <> 'quotes_receiving' then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'status', v_js.status);
  end if;
  select * into v_q from client_quotes where id = p_client_quote_id;
  if not found or v_q.submission_id <> v_js.id or v_q.status <> 'active'
     or v_q.valid_until < current_date
     or exists (select 1 from contractors where id = v_q.contractor_id and status = 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'quote_unavailable');
  end if;

  v_dep := sq_deposit_pence(v_q.client_price_pence, app_config_num('sq_deposit_rate', 1.0));
  if p_deposit_pence is not null and p_deposit_pence <> v_dep then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch',
                              'expected_pence', v_dep, 'got_pence', p_deposit_pence);
  end if;

  update job_submissions
     set status = 'accepted_awaiting_payment', accepted_client_quote_id = v_q.id
   where id = v_js.id;
  update client_quotes set status = 'accepted' where id = v_q.id;
  insert into job_payments (submission_id, client_quote_id, stripe_checkout_session_id,
                            amount_pence, expires_at, kind)
  values (v_js.id, v_q.id, p_session_id, v_dep, p_session_expires_at, 'deposit');

  perform log_job_event(v_js.id, 'status_change', 'quotes_receiving', 'accepted_awaiting_payment',
    'client', null, null, jsonb_build_object('client_quote_id', v_q.id));
  perform log_job_event(v_js.id, 'payment_link_issued', null, null, 'system', null, null,
    jsonb_build_object('session_id', p_session_id, 'amount_pence', v_dep,
                       'total_pence', v_q.client_price_pence,
                       'balance_pence', v_q.client_price_pence - v_dep));

  insert into pending_emails (kind, to_email, payload)
  values ('sq_payment_link', v_js.contact_email, jsonb_build_object(
    'client_token', v_js.client_token,
    'checkout_url', p_checkout_url,
    'amount_pence', v_dep,
    'total_pence', v_q.client_price_pence,
    'balance_pence', v_q.client_price_pence - v_dep,
    'expires_at', p_session_expires_at,
    'contractor_label', v_q.contractor_display_label,
    'price_basis', v_q.price_basis,
    'contact_name', v_js.contact_name,
    'terms_days', app_config_num('sq_balance_terms_days', 7)::int));

  return jsonb_build_object('ok', true, 'deposit_pence', v_dep);
end;
$function$

;

-- The job event says what the terms are, in words that survive zero.
CREATE OR REPLACE FUNCTION public.sq_open_balance(p_submission_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js      job_submissions%rowtype;
  v_price   int;
  v_basis   text;
  v_paid    int;
  v_balance int;
  v_dep     job_payments%rowtype;
  v_days    int;
  v_auto    boolean := app_config_num('sq_balance_auto_charge', 0) >= 1;
  v_due     timestamptz;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.accepted_client_quote_id is null then return 0; end if;

  -- Already open (or already settled) — nothing to do.
  if exists (select 1 from job_payments
              where submission_id = p_submission_id and kind = 'balance'
                and status in ('due', 'requested', 'failed', 'paid', 'pending')) then
    return 0;
  end if;

  select client_price_pence, price_basis into v_price, v_basis
    from client_quotes where id = v_js.accepted_client_quote_id;
  if v_price is null then return 0; end if;

  select coalesce(sum(amount_pence), 0) into v_paid
    from job_payments
   where submission_id = p_submission_id and kind = 'deposit' and status = 'paid';

  v_balance := v_price - v_paid;
  if v_balance <= 0 then return 0; end if;   -- rate 1.0: the flag-off path

  -- Carry the saved card forward from the deposit. Without it the worker has
  -- nothing to charge and every balance falls straight through to the link.
  select * into v_dep from job_payments
   where submission_id = p_submission_id and kind = 'deposit' and status = 'paid'
   order by paid_at desc limit 1;

  v_days := app_config_num('sq_balance_terms_days', 7)::int;
  v_due  := now() + make_interval(days => v_days);

  -- 'requested' = the customer pays (link or transfer); 'due' = the worker
  -- charges the saved card. The worker claims only 'due'.
  insert into job_payments (submission_id, client_quote_id, amount_pence, status, kind,
                            expires_at, due_at, stripe_customer_id, stripe_payment_method_id)
  values (p_submission_id, v_js.accepted_client_quote_id, v_balance,
          case when v_auto then 'due' else 'requested' end, 'balance',
          v_due, v_due, v_dep.stripe_customer_id, v_dep.stripe_payment_method_id);

  perform log_job_event(p_submission_id, 'balance_due', null, null, 'system', null,
    format('balance of %s pence %s, %s', v_balance,
           case when v_auto then 'due' else 'requested' end,
           case when v_days > 0 then format('within %s days of sign-off', v_days)
                else 'on receipt' end),
    jsonb_build_object('amount_pence', v_balance, 'total_pence', v_price,
                       'deposit_pence', v_paid, 'terms_days', v_days, 'auto_charge', v_auto));

  perform sq_notify_once(p_submission_id, coalesce(v_js.contact_email, 'unknown'),
    case when v_auto then 'sq_balance_due' else 'sq_balance_request' end,
    v_js.contact_email, jsonb_build_object(
      'submission_id', p_submission_id,
      'client_token', v_js.client_token,
      'due_at', v_due,
      'contact_name', v_js.contact_name,
      'amount_pence', v_balance,
      'total_pence', v_price,
      'deposit_pence', v_paid,
      'terms_days', v_days,
      'price_basis', v_basis,
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id)));

  return v_balance;
end;
$function$

;
