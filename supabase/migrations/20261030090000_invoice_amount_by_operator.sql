-- ============================================================================
-- The contractor's invoice figure, recorded by an operator.
--
-- sq_record_invoice_amount was written for the contractor's own upload form,
-- so it logged every entry as the contractor's statement. An operator keying
-- in a figure from an emailed invoice (or one uploaded before the form
-- existed) must not be recorded as the contractor confirming anything: the
-- event carries the real actor, and the row remembers who recorded it so the
-- admin page can say so.
--
-- Signature change, so the old overload is dropped first: with named
-- arguments and defaults, two overloads would make every call ambiguous.
-- ============================================================================
alter table contractor_invoice_amounts
  add column if not exists recorded_by uuid;
comment on column contractor_invoice_amounts.recorded_by is
  'Operator who keyed the figure in; null when the contractor recorded it themselves.';

drop function if exists public.sq_record_invoice_amount(uuid, uuid, int, text);

create or replace function public.sq_record_invoice_amount(
  p_submission_id uuid, p_contractor_id uuid, p_invoiced_pence int, p_note text,
  p_operator_id uuid default null
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
  v_actor_type text := case when p_operator_id is null then 'contractor' else 'operator' end;
  v_actor_id   uuid := coalesce(p_operator_id, p_contractor_id);
  v_who        text := case when p_operator_id is null then '' else ' (recorded by an operator)' end;
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
    perform log_job_event(p_submission_id, 'invoice_amount', null, null, v_actor_type,
      v_actor_id, 'replacement invoice matches the applied amount' || v_who,
      jsonb_build_object('invoiced_pence', v_amount));
    return jsonb_build_object('ok', true, 'status', 'applied',
                              'quoted_pence', v_quoted, 'invoiced_pence', v_amount);
  end if;
  -- A decided row is not reopened from here: applying or declining is final
  -- for that figure. The operator path only ever starts a record.
  if found and p_operator_id is not null and v_prev.status in ('applied', 'declined', 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'already_' || v_prev.status);
  end if;

  v_status := case when v_amount = v_quoted then 'matches' else 'pending' end;

  insert into contractor_invoice_amounts
    (submission_id, contractor_id, quoted_pence, invoiced_pence, note, status, recorded_by)
  values (p_submission_id, p_contractor_id, v_quoted, v_amount, v_note, v_status, p_operator_id)
  on conflict (submission_id) do update
     set invoiced_pence = excluded.invoiced_pence,
         note = excluded.note,
         status = excluded.status,
         quoted_pence = excluded.quoted_pence,
         recorded_by = excluded.recorded_by,
         client_before_pence = null, client_after_pence = null,
         decided_at = null, decided_by = null, decision_note = null,
         updated_at = now();

  perform log_job_event(p_submission_id, 'invoice_amount', null, null, v_actor_type, v_actor_id,
    case when v_status = 'matches' then 'invoice matches the quote'
         else 'invoice differs from the quote' end || v_who,
    jsonb_build_object('quoted_pence', v_quoted, 'invoiced_pence', v_amount,
                       'note', v_note, 'recorded_by', p_operator_id));

  -- The total is confirmed: ask the customer. A no-op where a balance is
  -- already open or settled (jobs signed off before this change, replacements).
  if v_status = 'matches' and v_js.status in ('completed', 'paid')
     and not exists (select 1 from contractor_payouts where submission_id = p_submission_id) then
    v_opened := sq_open_balance(p_submission_id);
  end if;

  return jsonb_build_object('ok', true, 'status', v_status,
                            'quoted_pence', v_quoted, 'invoiced_pence', v_amount,
                            'balance_opened_pence', v_opened);
end;
$$;

revoke all on function public.sq_record_invoice_amount(uuid, uuid, int, text, uuid) from public, anon, authenticated;
grant execute on function public.sq_record_invoice_amount(uuid, uuid, int, text, uuid) to service_role;
