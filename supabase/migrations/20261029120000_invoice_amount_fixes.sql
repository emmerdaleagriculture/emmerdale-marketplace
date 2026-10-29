-- ============================================================================
-- Applying an invoice amount, second pass (review of PR #280).
--
--   * An open balance row is never edited. The customer may have a Stripe
--     Checkout open for it at the old figure; a completed session settles
--     the row by id, and the row would then read "paid" at an amount nobody
--     charged. The old row is expired and a fresh one opened for what the
--     new total leaves unpaid; the webhook refuses to settle an expired row.
--   * A job already 'paid' goes back to 'completed' while the new balance is
--     open, so "paid in full" means it again and settling moves it forward.
--   * A lower invoice applies too: the open row is expired, and anything the
--     customer has over-paid is reported for a refund by hand rather than
--     refusing and leaving the old request live on their job page.
--   * Nothing applies once the payout has been recorded.
-- ============================================================================

create or replace function sq_apply_invoice_amount(
  p_submission_id uuid, p_actor uuid, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js      job_submissions%rowtype;
  v_inv     contractor_invoice_amounts%rowtype;
  v_cl      client_quotes%rowtype;
  v_new     int;
  v_paid    int;
  v_due     int;
  v_open    job_payments%rowtype;
  v_payment uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_inv from contractor_invoice_amounts where submission_id = p_submission_id for update;
  if not found or v_inv.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  if v_js.status not in ('completed', 'paid') then
    return jsonb_build_object('ok', false, 'reason', 'status_' || v_js.status);
  end if;
  if exists (select 1 from contractor_payouts where submission_id = p_submission_id) then
    return jsonb_build_object('ok', false, 'reason', 'paid_out');
  end if;

  select * into v_cl from client_quotes where id = v_js.accepted_client_quote_id for update;
  v_new := client_price_pence(v_inv.invoiced_pence, v_cl.markup_rate);

  select coalesce(sum(amount_pence), 0) into v_paid from job_payments
   where submission_id = v_js.id and status = 'paid';
  v_due := v_new - v_paid;

  -- Whatever was open is superseded, whichever way the total moved.
  for v_open in
    select * from job_payments
     where submission_id = v_js.id and kind = 'balance' and status in ('requested', 'due', 'failed')
     for update
  loop
    update job_payments
       set status = 'expired', expires_at = now(),
           last_error = 'superseded: invoice amount applied'
     where id = v_open.id;
  end loop;

  if v_due > 0 then
    insert into job_payments (submission_id, client_quote_id, amount_pence, status, kind,
                              expires_at, due_at)
    values (v_js.id, v_cl.id, v_due, 'requested', 'balance', now(), now())
    returning id into v_payment;
    -- Collecting again: not paid in full until this one settles.
    if v_js.status = 'paid' then
      update job_submissions set status = 'completed' where id = v_js.id;
      perform log_job_event(v_js.id, 'status_change', 'paid', 'completed', 'operator', p_actor,
        'invoice amount applied; a further balance is due', '{}');
    end if;
  end if;

  -- The invoiced figure is now the price, as a revised site-visit price is:
  -- a total, whatever rate it was first quoted on.
  update contractor_quotes
     set contractor_price_pence = v_inv.invoiced_pence, quote_type = 'total'
   where id = v_cl.contractor_quote_id;
  update client_quotes
     set client_price_pence = v_new,
         client_rate_value_pence = null, client_rate_minimum_pence = null,
         unit_label = null, unit_quantity = null
   where id = v_cl.id;

  update contractor_invoice_amounts
     set status = 'applied', client_before_pence = v_cl.client_price_pence,
         client_after_pence = v_new, decided_at = now(), decided_by = p_actor,
         decision_note = v_note, updated_at = now()
   where submission_id = v_js.id;

  perform log_job_event(v_js.id, 'invoice_amount_applied', null, null, 'operator', p_actor,
    coalesce(v_note, 'customer charged the invoiced amount'),
    jsonb_build_object('quoted_pence', v_inv.quoted_pence, 'invoiced_pence', v_inv.invoiced_pence,
                       'old_client_pence', v_cl.client_price_pence, 'new_client_pence', v_new,
                       'due_pence', v_due, 'payment_id', v_payment));

  if v_due > 0 and v_js.contact_email is not null then
    insert into pending_emails (kind, to_email, payload) values ('sq_balance_revised', v_js.contact_email,
      jsonb_build_object(
        'submission_id', v_js.id,
        'client_token', v_js.client_token,
        'contact_name', v_js.contact_name,
        'contractor_business_name',
          (select business_name from contractors where id = v_js.awarded_contractor_id),
        'old_total_pence', v_cl.client_price_pence,
        'total_pence', v_new,
        'paid_pence', v_paid,
        'amount_pence', v_due,
        'reason', v_inv.note,
        'price_basis', v_cl.price_basis));
  end if;

  return jsonb_build_object('ok', true, 'new_client_pence', v_new,
                            'due_pence', greatest(v_due, 0),
                            'refund_pence', greatest(-v_due, 0));
end;
$$;
