-- Balances can be settled by bank transfer (2026-10-16).
--
-- The first two live off-session balance charges were both declined, and the
-- customer's only way to pay was the card button on the job page. The
-- balance-action-needed email and the Pay panel now also show the company
-- bank account with a per-job reference ("EA-" + first 8 chars of the id —
-- src/lib/site.ts paymentReference()). Two things have to change here:
--
--  1. sq_fail_balance's customer payload gains submission_id so the email
--     can print that reference (pending_emails has no submission column).
--  2. sq_mark_balance_transferred(): an operator saw the transfer land and
--     settles the balance by hand. It goes through sq_settle_balance so
--     everything that follows a card settlement — 'paid' status, the paid
--     email, the invoice request, the payout becoming due — happens the same
--     way, with no Stripe intent on the row and an event saying why. It also
--     works on a 'due' row: settling it is what stops the worker charging
--     the card for money that has already arrived.

create or replace function public.sq_fail_balance(p_payment_id uuid, p_error text, p_final boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pay job_payments%rowtype;
  v_js  job_submissions%rowtype;
begin
  select * into v_pay from job_payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  update job_payments
     set status = case when p_final then 'failed' else 'due' end,
         last_error = left(coalesce(p_error, ''), 500)
   where id = p_payment_id;

  select * into v_js from job_submissions where id = v_pay.submission_id;
  perform log_job_event(v_pay.submission_id, 'balance_charge_failed', null, null, 'system', null,
    left(coalesce(p_error, ''), 200),
    jsonb_build_object('amount_pence', v_pay.amount_pence, 'attempts', v_pay.attempts));

  if p_final then
    perform sq_notify_once(v_pay.submission_id, coalesce(v_js.contact_email, 'unknown'),
      'sq_balance_action_needed', v_js.contact_email, jsonb_build_object(
        'submission_id', v_pay.submission_id,
        'client_token', v_js.client_token,
        'contact_name', v_js.contact_name,
        'amount_pence', v_pay.amount_pence,
        'due_at', v_pay.due_at,
        'price_basis',
          (select price_basis from client_quotes where id = v_pay.client_quote_id)));
    perform sq_notify_once(v_pay.submission_id, '__admin__', 'sq_balance_stuck', '__admin__',
      jsonb_build_object('submission_id', v_pay.submission_id,
                         'amount_pence', v_pay.amount_pence, 'error', left(coalesce(p_error,''), 200)));
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.sq_mark_balance_transferred(p_payment_id uuid, p_actor uuid, p_note text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pay job_payments%rowtype;
  v_res jsonb;
begin
  select * into v_pay from job_payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_pay.kind <> 'balance' then return jsonb_build_object('ok', false, 'reason', 'not_a_balance'); end if;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  if v_pay.status not in ('due', 'failed') then
    return jsonb_build_object('ok', false, 'reason', 'status_' || v_pay.status);
  end if;

  perform log_job_event(v_pay.submission_id, 'balance_bank_transfer', null, null, 'operator', p_actor,
    coalesce(nullif(trim(p_note), ''), 'Balance received by bank transfer'),
    jsonb_build_object('amount_pence', v_pay.amount_pence, 'payment_id', v_pay.id));

  -- Settles, marks the job paid, emails the customer, asks for the invoice.
  v_res := sq_settle_balance(p_payment_id, null);
  update job_payments set stripe_payment_intent_id = null where id = p_payment_id;
  return v_res;
end;
$function$;

revoke all on function public.sq_mark_balance_transferred(uuid, uuid, text) from public, anon, authenticated;
