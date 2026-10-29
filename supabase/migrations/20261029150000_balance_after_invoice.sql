-- ============================================================================
-- The balance waits for the invoice.
--
-- Until now sign-off (the customer confirming, or auto-confirm after three
-- working days) opened the balance and asked the customer for it at once;
-- the contractor's invoice came afterwards, and on 23 Oct 2026 it came in at
-- a different figure from the one the customer had already been asked for.
--
-- Now sign-off asks the CONTRACTOR for their invoice, and the customer is
-- asked for the balance only once the contractor has confirmed the total:
--   * invoice uploaded, "matches my quote" ticked  -> balance at the quote;
--   * invoice differs, operator applies it         -> balance at the new total
--     (sq_apply_invoice_amount, unchanged);
--   * invoice differs, operator pays the quote     -> balance at the quote.
-- An operator can still open the balance by hand (sq_open_balance, now
-- callable by the service role) for a contractor who never invoices.
-- ============================================================================

-- ── Sign-off: ask the contractor for the invoice, not the customer for money
create or replace function public.confirm_completion_by_client(p_submission_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_email text;
  v_owed  int;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status in ('completed', 'paid') then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.status <> 'completed_by_contractor' then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions set status = 'completed' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'completed_by_contractor', 'completed',
    'client', null, null, '{}');

  -- Sign-off makes the rest of the money owed (terms 7.2), but it is asked
  -- for once the contractor has confirmed the total on their invoice
  -- (sq_record_invoice_amount), not here.
  select cq.contractor_price_pence into v_owed
    from client_quotes clq join contractor_quotes cq on cq.id = clq.contractor_quote_id
   where clq.id = v_js.accepted_client_quote_id;
  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email, 'sq_completion_confirmed', v_email,
      jsonb_build_object('contact_name', v_js.contact_name, 'amount_pence', v_owed));
  end if;

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'),
    'sq_rating_request', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id),
      'contact_name', v_js.contact_name));
  return jsonb_build_object('ok', true, 'balance_pence', 0);
end;
$$;

create or replace function public.auto_confirm_due_completions()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r       record;
  v_done  int := 0;
  v_email text;
  v_owed  int;
begin
  for r in
    select * from job_submissions
     where status = 'completed_by_contractor'
       and completed_by_contractor_at is not null
       and working_days_since(completed_by_contractor_at) >= 3
     for update skip locked
  loop
    begin
      update job_submissions set status = 'completed' where id = r.id;
      perform log_job_event(r.id, 'status_change', 'completed_by_contractor', 'completed',
        'system', null, 'auto-confirmed: 3 working days elapsed (terms 7.2)', '{}');

      -- The customer's silence is agreement by 7.2, including agreement to
      -- pay; the asking still waits for the contractor's invoice.
      select cq.contractor_price_pence into v_owed
        from client_quotes clq join contractor_quotes cq on cq.id = clq.contractor_quote_id
       where clq.id = r.accepted_client_quote_id;
      select email into v_email from contractors where id = r.awarded_contractor_id;
      if v_email is not null then
        perform sq_notify_once(r.id, v_email, 'sq_completion_confirmed', v_email,
          jsonb_build_object('contact_name', r.contact_name, 'amount_pence', v_owed));
      end if;
      perform sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
        'sq_rating_request', r.contact_email, jsonb_build_object(
          'client_token', r.client_token,
          'contractor_business_name',
            (select business_name from contractors where id = r.awarded_contractor_id),
          'contact_name', r.contact_name));
      v_done := v_done + 1;
    exception when others then
      raise warning 'auto-confirm failed for %: %', r.id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$$;

-- ── Invoice in at the quoted figure: now the customer is asked ───────────
create or replace function public.sq_record_invoice_amount(
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
  v_opened int := 0;
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

  -- The total is confirmed: ask the customer. A no-op where a balance is
  -- already open or settled (jobs signed off before this change, replacements).
  if v_status = 'matches' and v_js.status in ('completed', 'paid') then
    v_opened := sq_open_balance(p_submission_id);
  end if;

  return jsonb_build_object('ok', true, 'status', v_status,
                            'quoted_pence', v_quoted, 'invoiced_pence', v_amount,
                            'balance_opened_pence', v_opened);
end;
$$;

-- ── Operator pays the quote: the customer is asked for the quoted balance ─
create or replace function public.sq_decline_invoice_amount(
  p_submission_id uuid, p_actor uuid, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv    contractor_invoice_amounts%rowtype;
  v_opened int;
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
  v_opened := sq_open_balance(p_submission_id);
  return jsonb_build_object('ok', true, 'balance_opened_pence', v_opened);
end;
$$;

-- An operator's "Request the balance now", for a contractor who never
-- invoices. Service role only; the function was postgres-only before.
revoke all on function public.sq_open_balance(uuid) from public, anon, authenticated;
grant execute on function public.sq_open_balance(uuid) to service_role;
