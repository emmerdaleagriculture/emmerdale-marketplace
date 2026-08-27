-- ============================================================================
-- Sealed-quote engine: code-review fixes (four function replacements).
--
-- 1. submit_contractor_quote: a quote the client has ACCEPTED (payment
--    pending) can no longer be revised out from under them — the revision is
--    refused until the payment window resolves. An UNCONFIRMED email-parsed
--    figure no longer supersedes a live confirmed quote; supersession now
--    happens at confirmation time, so the client's list never silently loses
--    a real price to an unconfirmed parse.
-- 2. confirm_email_quote: performs that deferred supersession.
-- 3. void_acceptance: only revives the accepted quote if it is still the
--    contractor's live quote — a revision during the payment window wins,
--    preventing two live prices under one label.
-- 4. award_submission: re-reads the payment row under the submission lock, so
--    Stripe's documented duplicate webhook deliveries land on the idempotent
--    path instead of firing a false MANUAL REFUND alert.
-- ============================================================================

-- ── submit_contractor_quote ─────────────────────────────────────────────────
create or replace function submit_contractor_quote(
  p_token text,
  p_quote_type text,
  p_price_pence int,
  p_rate_value_pence int,
  p_rate_minimum_pence int,
  p_site_visit boolean,
  p_notes text,
  p_valid_until date,
  p_source text,
  p_confirmed boolean
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv job_invitations%rowtype;
  v_js job_submissions%rowtype;
  v_prior contractor_quotes%rowtype;
  v_prior_cq_status text;
  v_acres numeric;
  v_price int;
  v_new_id uuid;
  v_confirm_token text;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id for update;

  if v_js.status not in ('distributed','quotes_receiving','accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_inv.status in ('declined','closed_awarded','closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'declined');
  end if;
  if p_quote_type not in ('total','rate') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;

  if p_quote_type = 'rate' then
    if p_rate_value_pence is null or p_rate_value_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_rate');
    end if;
    v_acres := coalesce(v_js.area_mapped_value,
                        case when v_js.area_unit = 'acres' then v_js.area_value end);
    if v_acres is null or v_acres <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'rate_needs_area');
    end if;
    v_price := greatest(round(p_rate_value_pence * v_acres)::int,
                        coalesce(p_rate_minimum_pence, 0));
  else
    if p_price_pence is null or p_price_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_price');
    end if;
    v_price := p_price_pence;
  end if;

  if p_valid_until is not null and v_js.expires_at is not null
     and p_valid_until > v_js.expires_at::date then
    p_valid_until := v_js.expires_at::date;
  end if;

  select * into v_prior from contractor_quotes
   where submission_id = v_js.id and contractor_id = v_inv.contractor_id
     and superseded_by is null and confirmed_by_contractor
   order by created_at desc limit 1;

  -- A price the client has accepted and is paying for cannot be revised out
  -- from under them; it frees up if the payment link lapses.
  if v_prior.id is not null then
    select status into v_prior_cq_status
      from client_quotes where contractor_quote_id = v_prior.id;
    if v_prior_cq_status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'accepted_pending_payment');
    end if;
  end if;

  if p_confirmed = false then v_confirm_token := sq_token(); end if;

  -- Supersession happens ONLY for confirmed submissions. An unconfirmed
  -- email-parse must never remove a live price from the client's list —
  -- confirm_email_quote supersedes at confirmation time instead.
  if coalesce(p_confirmed, true) and v_prior.id is not null then
    -- Park the prior on a self-reference first (one-live-quote partial index).
    update contractor_quotes set superseded_by = v_prior.id where id = v_prior.id;
  end if;

  insert into contractor_quotes (
    submission_id, contractor_id, invitation_id, quote_type,
    contractor_price_pence, rate_value_pence, rate_minimum_pence,
    notes_internal, site_visit_required, valid_until,
    source, confirmed_by_contractor, confirm_token
  ) values (
    v_js.id, v_inv.contractor_id, v_inv.id, p_quote_type,
    v_price, p_rate_value_pence, p_rate_minimum_pence,
    nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_site_visit, false),
    coalesce(p_valid_until, coalesce(v_js.expires_at::date, current_date + 7)),
    p_source, coalesce(p_confirmed, true), v_confirm_token
  ) returning id into v_new_id;

  if coalesce(p_confirmed, true) and v_prior.id is not null then
    update contractor_quotes set superseded_by = v_new_id where id = v_prior.id;
    update client_quotes set status = 'superseded'
     where contractor_quote_id = v_prior.id and status = 'active';
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'revised');
  else
    insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
    values (v_inv.id, v_inv.contractor_id,
            case when coalesce(p_confirmed, true) then 'priced' else 'confirm_pending' end,
            jsonb_build_object('time_to_price_seconds',
              extract(epoch from now() - v_inv.sent_at)::int));
  end if;

  if coalesce(p_confirmed, true) then
    perform sq_publish_quote(v_new_id);
    return jsonb_build_object('ok', true, 'quote_id', v_new_id);
  end if;

  insert into pending_emails (kind, to_email, payload)
  select 'sq_quote_confirm', ct.email, jsonb_build_object(
    'confirm_token', v_confirm_token,
    'amount_pence', v_price,
    'service', (select name from services where id = v_js.service_id),
    'postcode_district', split_part(v_js.postcode, ' ', 1))
  from contractors ct where ct.id = v_inv.contractor_id;
  return jsonb_build_object('ok', true, 'quote_id', v_new_id, 'pending_confirm', true);
end;
$$;

-- ── confirm_email_quote ─────────────────────────────────────────────────────
create or replace function confirm_email_quote(p_confirm_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cq contractor_quotes%rowtype;
  v_js job_submissions%rowtype;
  v_prior contractor_quotes%rowtype;
  v_prior_cq_status text;
begin
  select * into v_cq from contractor_quotes where confirm_token = p_confirm_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_cq.confirmed_by_contractor then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  select * into v_js from job_submissions where id = v_cq.submission_id for update;
  if v_js.status not in ('distributed','quotes_receiving','accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_cq.superseded_by is not null then
    return jsonb_build_object('ok', false, 'reason', 'superseded');
  end if;

  -- Deferred supersession: the live confirmed quote (untouched at parse time)
  -- gives way only now that the contractor has stood behind the new figure.
  select * into v_prior from contractor_quotes
   where submission_id = v_cq.submission_id and contractor_id = v_cq.contractor_id
     and id <> v_cq.id and superseded_by is null and confirmed_by_contractor
   order by created_at desc limit 1;
  if v_prior.id is not null then
    select status into v_prior_cq_status
      from client_quotes where contractor_quote_id = v_prior.id;
    if v_prior_cq_status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'accepted_pending_payment');
    end if;
    update contractor_quotes set superseded_by = v_cq.id where id = v_prior.id;
    update client_quotes set status = 'superseded'
     where contractor_quote_id = v_prior.id and status = 'active';
  end if;

  update contractor_quotes
     set confirmed_by_contractor = true, confirm_token = null
   where id = v_cq.id;
  insert into invitation_events (invitation_id, contractor_id, event_type)
  values (v_cq.invitation_id, v_cq.contractor_id, 'confirmed');
  perform sq_publish_quote(v_cq.id);
  return jsonb_build_object('ok', true, 'amount_pence', v_cq.contractor_price_pence);
end;
$$;

-- ── void_acceptance ─────────────────────────────────────────────────────────
create or replace function void_acceptance(p_session_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pay job_payments%rowtype;
  v_js job_submissions%rowtype;
  v_revived int;
begin
  select * into v_pay from job_payments where stripe_checkout_session_id = p_session_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_session'); end if;
  if v_pay.status <> 'pending' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  select * into v_js from job_submissions where id = v_pay.submission_id for update;
  update job_payments set status = 'expired' where id = v_pay.id;

  if v_js.status = 'accepted_awaiting_payment'
     and v_js.accepted_client_quote_id = v_pay.client_quote_id then
    update job_submissions
       set status = 'quotes_receiving', accepted_client_quote_id = null
     where id = v_js.id;
    -- Revive the quote ONLY if it is still the contractor's live confirmed
    -- price; a revision during the payment window supersedes it instead.
    update client_quotes cq set status = 'active'
     where cq.id = v_pay.client_quote_id
       and exists (select 1 from contractor_quotes q
                    where q.id = cq.contractor_quote_id
                      and q.superseded_by is null and q.confirmed_by_contractor);
    get diagnostics v_revived = row_count;
    if v_revived = 0 then
      update client_quotes set status = 'superseded'
       where id = v_pay.client_quote_id and status = 'accepted';
    end if;
    perform log_job_event(v_js.id, 'payment_link_expired', 'accepted_awaiting_payment',
      'quotes_receiving', 'system', null, null,
      jsonb_build_object('session_id', p_session_id));
    insert into pending_emails (kind, to_email, payload)
    values ('sq_payment_expired', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_label', (select contractor_display_label from client_quotes where id = v_pay.client_quote_id),
      'contact_name', v_js.contact_name));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── award_submission ────────────────────────────────────────────────────────
create or replace function award_submission(p_session_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pay job_payments%rowtype;
  v_js job_submissions%rowtype;
  v_q client_quotes%rowtype;
  v_cq contractor_quotes%rowtype;
  v_ct contractors%rowtype;
  v_inv record;
begin
  select * into v_pay from job_payments where stripe_checkout_session_id = p_session_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_session'); end if;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  select * into v_js from job_submissions where id = v_pay.submission_id for update;

  -- Duplicate webhook deliveries race to this lock: re-read the payment now
  -- that we hold it, so the loser takes the idempotent path rather than
  -- firing a false MANUAL REFUND alert.
  select * into v_pay from job_payments where id = v_pay.id;
  if v_pay.status = 'paid' then return jsonb_build_object('ok', true, 'idempotent', true); end if;

  update job_payments set status = 'paid', paid_at = now() where id = v_pay.id;
  select * into v_q from client_quotes where id = v_pay.client_quote_id;

  if v_js.status = 'accepted_awaiting_payment' and v_js.accepted_client_quote_id = v_pay.client_quote_id then
    null; -- happy path
  elsif v_js.status = 'quotes_receiving' and v_q.status in ('active','accepted') then
    update job_submissions set accepted_client_quote_id = v_q.id where id = v_js.id;
    update client_quotes set status = 'accepted' where id = v_q.id;
  else
    perform sq_notify_once(v_js.id, '__admin__', 'sq_payment_needs_refund', '__admin__',
      jsonb_build_object('submission_id', v_js.id, 'session_id', p_session_id,
                         'amount_pence', v_pay.amount_pence, 'job_status', v_js.status));
    return jsonb_build_object('ok', false, 'reason', 'job_closed_manual_refund');
  end if;

  select * into v_cq from contractor_quotes where id = v_q.contractor_quote_id;
  select * into v_ct from contractors where id = v_q.contractor_id;

  update job_submissions
     set status = 'awarded', awarded_at = now(), awarded_contractor_id = v_q.contractor_id
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'awarded', 'system', null, null,
    jsonb_build_object('session_id', p_session_id, 'client_quote_id', v_q.id));
  perform log_job_event(v_js.id, 'payment_cleared', null, null, 'system', null, null,
    jsonb_build_object('amount_pence', v_pay.amount_pence));

  update client_quotes set contractor_real_name = v_ct.business_name, status = 'accepted'
   where id = v_q.id;

  for v_inv in
    select * from job_invitations
     where submission_id = v_js.id and contractor_id <> v_q.contractor_id
       and status in ('sent','viewed','priced')
  loop
    update job_invitations set status = 'closed_awarded' where id = v_inv.id;
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'closed_awarded');
    perform sq_notify_once(v_js.id, v_inv.contractor_id::text, 'sq_award_lost',
      (select email from contractors where id = v_inv.contractor_id),
      jsonb_build_object('service', (select name from services where id = v_js.service_id),
                         'postcode_district', split_part(v_js.postcode, ' ', 1)));
  end loop;
  update client_quotes set status = 'closed'
   where submission_id = v_js.id and id <> v_q.id and status in ('active','superseded');

  perform log_job_event(v_js.id, 'contact_released', null, null, 'system', null, null,
    jsonb_build_object('contractor_id', v_q.contractor_id,
                       'fields', jsonb_build_array('name','phone','email','postcode','w3w')));

  perform sq_notify_once(v_js.id, v_q.contractor_id::text, 'sq_award_won', v_ct.email,
    jsonb_build_object(
      'submission_id', v_js.id,
      'service', (select name from services where id = v_js.service_id),
      'contact_name', v_js.contact_name,
      'contact_phone', v_js.contact_phone,
      'contact_email', v_js.contact_email,
      'postcode', v_js.postcode,
      'gate_w3w', v_js.gate_w3w,
      'contractor_price_pence', v_cq.contractor_price_pence));

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_award_client',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name', v_ct.business_name,
      'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'awarded_to', v_q.contractor_id);
end;
$$;
