-- ============================================================================
-- The invoice against the quote.
--
-- On 23 Oct 2026 a contractor uploaded an invoice for £550 on a job quoted at
-- £350 (a per-acre rate that came out at its minimum, travel included). The
-- photo was the only record of the figure: nothing on the job said the two
-- disagreed, the payout still read £350, and the customer had already been
-- asked for, and had paid, a balance worked out from the quote.
--
-- Now the contractor says, at upload, whether the invoice matches the quote,
-- and if not, what it comes to and why. A different figure waits for an
-- operator (it is the contractor's claim, and the customer agreed to the
-- quote): applying it re-prices the job and asks the customer for whatever
-- the new total leaves unpaid; declining it leaves the quote, and the
-- payout, where they were.
--
-- Sealed like contractor_payouts: the amount is the contractor's price, and
-- customers can read their own job_submissions row.
-- ============================================================================

create table if not exists contractor_invoice_amounts (
  submission_id  uuid primary key references job_submissions(id) on delete cascade,
  contractor_id  uuid not null references contractors(id),
  -- The contractor's price on the accepted quote when the invoice came in.
  quoted_pence   int not null check (quoted_pence > 0),
  invoiced_pence int not null check (invoiced_pence > 0),
  note           text check (char_length(note) <= 1000),
  -- matches: the contractor confirmed the quote. pending: a different figure,
  -- waiting for an operator. applied / declined: the operator's decision.
  status         text not null check (status in ('matches', 'pending', 'applied', 'declined')),
  -- The customer's total before and after, set when applied.
  client_before_pence int,
  client_after_pence  int,
  decided_at     timestamptz,
  decided_by     uuid,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table contractor_invoice_amounts enable row level security;
revoke all on contractor_invoice_amounts from anon, authenticated;

-- ── Contractor: what the invoice comes to ──────────────────────────────
-- p_invoiced_pence null = "matches my quote". A replacement invoice records
-- again, and a new figure goes back to pending even after a decision: the
-- operator decided on the old one.
create or replace function sq_record_invoice_amount(
  p_submission_id uuid, p_contractor_id uuid, p_invoiced_pence int, p_note text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js     job_submissions%rowtype;
  v_quoted int;
  v_amount int;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_prev   contractor_invoice_amounts%rowtype;
  v_status text;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.awarded_contractor_id is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  select cq.contractor_price_pence into v_quoted
    from client_quotes clq
    join contractor_quotes cq on cq.id = clq.contractor_quote_id
   where clq.id = v_js.accepted_client_quote_id;
  if v_quoted is null then return jsonb_build_object('ok', false, 'reason', 'no_quote'); end if;

  if p_invoiced_pence is not null and p_invoiced_pence <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_amount');
  end if;
  v_amount := coalesce(p_invoiced_pence, v_quoted);
  if v_amount <> v_quoted and v_note is null then
    return jsonb_build_object('ok', false, 'reason', 'no_reason');
  end if;

  -- After an applied difference the quote already carries the invoiced
  -- figure, so a replacement at that figure leaves the decision standing.
  select * into v_prev from contractor_invoice_amounts where submission_id = p_submission_id;
  if found and v_prev.status = 'applied' and v_amount = v_quoted then
    perform log_job_event(p_submission_id, 'invoice_amount', null, null, 'contractor',
      p_contractor_id, 'replacement invoice matches the applied amount',
      jsonb_build_object('invoiced_pence', v_amount));
    return jsonb_build_object('ok', true, 'status', 'applied',
                              'quoted_pence', v_quoted, 'invoiced_pence', v_amount);
  end if;

  v_status := case when v_amount = v_quoted then 'matches' else 'pending' end;

  insert into contractor_invoice_amounts
    (submission_id, contractor_id, quoted_pence, invoiced_pence, note, status)
  values (p_submission_id, p_contractor_id, v_quoted, v_amount, v_note, v_status)
  on conflict (submission_id) do update
     set invoiced_pence = excluded.invoiced_pence,
         note = excluded.note,
         status = excluded.status,
         quoted_pence = excluded.quoted_pence,
         client_before_pence = null, client_after_pence = null,
         decided_at = null, decided_by = null, decision_note = null,
         updated_at = now();

  perform log_job_event(p_submission_id, 'invoice_amount', null, null, 'contractor', p_contractor_id,
    case when v_status = 'matches' then 'invoice matches the quote'
         else 'invoice differs from the quote' end,
    jsonb_build_object('quoted_pence', v_quoted, 'invoiced_pence', v_amount));

  return jsonb_build_object('ok', true, 'status', v_status,
                            'quoted_pence', v_quoted, 'invoiced_pence', v_amount);
end;
$$;

-- ── Operator: charge the customer for the invoiced figure ──────────────
-- The new total goes through client_price_pence() at the quote's own markup,
-- as every customer price does. What it leaves unpaid goes on the open
-- balance if there is one, or on a new 'requested' balance row if the first
-- was already paid (the job page and pay action pick up the newest unpaid
-- balance row, and the webhook settles by payment id).
create or replace function sq_apply_invoice_amount(
  p_submission_id uuid, p_actor uuid, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js     job_submissions%rowtype;
  v_inv    contractor_invoice_amounts%rowtype;
  v_cl     client_quotes%rowtype;
  v_new    int;
  v_paid   int;
  v_due    int;
  v_open   job_payments%rowtype;
  v_payment uuid;
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

  select * into v_cl from client_quotes where id = v_js.accepted_client_quote_id for update;
  v_new := client_price_pence(v_inv.invoiced_pence, v_cl.markup_rate);

  select coalesce(sum(amount_pence), 0) into v_paid from job_payments
   where submission_id = v_js.id and status = 'paid';
  v_due := v_new - v_paid;
  -- Less than the customer has already paid means a refund, which is Stripe
  -- or a bank transfer by hand, not a button.
  if v_due < 0 then
    return jsonb_build_object('ok', false, 'reason', 'needs_refund', 'refund_pence', -v_due);
  end if;

  select * into v_open from job_payments
   where submission_id = v_js.id and kind = 'balance' and status in ('requested', 'due', 'failed')
   order by created_at desc limit 1
   for update;

  if v_open.id is not null then
    if v_due = 0 then
      return jsonb_build_object('ok', false, 'reason', 'nothing_due');
    end if;
    update job_payments set amount_pence = v_due where id = v_open.id;
    v_payment := v_open.id;
  elsif v_due > 0 then
    insert into job_payments (submission_id, client_quote_id, amount_pence, status, kind,
                              expires_at, due_at)
    values (v_js.id, v_cl.id, v_due, 'requested', 'balance', now(), now())
    returning id into v_payment;
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
         decision_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where submission_id = v_js.id;

  perform log_job_event(v_js.id, 'invoice_amount_applied', null, null, 'operator', p_actor,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'customer charged the invoiced amount'),
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

  return jsonb_build_object('ok', true, 'new_client_pence', v_new, 'due_pence', v_due);
end;
$$;

-- ── Operator: pay what was quoted ──────────────────────────────────────
create or replace function sq_decline_invoice_amount(
  p_submission_id uuid, p_actor uuid, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv contractor_invoice_amounts%rowtype;
begin
  select * into v_inv from contractor_invoice_amounts where submission_id = p_submission_id for update;
  if not found or v_inv.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  update contractor_invoice_amounts
     set status = 'declined', decided_at = now(), decided_by = p_actor,
         decision_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where submission_id = p_submission_id;
  perform log_job_event(p_submission_id, 'invoice_amount_declined', null, null, 'operator', p_actor,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'paying the quoted amount, not the invoice'),
    jsonb_build_object('quoted_pence', v_inv.quoted_pence, 'invoiced_pence', v_inv.invoiced_pence));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function sq_record_invoice_amount(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function sq_apply_invoice_amount(uuid, uuid, text) from public, anon, authenticated;
revoke all on function sq_decline_invoice_amount(uuid, uuid, text) from public, anon, authenticated;
grant execute on function sq_record_invoice_amount(uuid, uuid, int, text) to service_role;
grant execute on function sq_apply_invoice_amount(uuid, uuid, text) to service_role;
grant execute on function sq_decline_invoice_amount(uuid, uuid, text) to service_role;
