-- VAT basis on a price (§14 reservation, finally read).
--
-- contractor_quotes.price_basis has existed since the core tables with a
-- default of 'unspecified' and nothing reading it. The pricing form now asks,
-- so this constrains the column to the states we understand, carries the
-- answer onto the client-facing row, and labels it for the customer.
--
-- The tick box says one thing: is VAT present in the figure the customer sees?
--
-- 'inc_vat'     — yes, VAT is in it.
-- 'no_vat'      — no VAT in it (the contractor isn't VAT registered).
-- 'unspecified' — every row written before this migration, and the email-parse
--                 path, which can't tell. Shown to the customer bare, exactly
--                 as today.
--
-- Either way the figure IS the whole charge, so no money logic changes: the 15%
-- deposit and the balance are shares of this same figure, as before.
--
-- Deliberately NOT touched: client_price_pence(), the markup, and the
-- deposit/balance split. The basis is a label, not an arithmetic input — so no
-- existing money moves because of this migration.

alter table contractor_quotes
  drop constraint if exists cq_price_basis_known;
alter table contractor_quotes
  add constraint cq_price_basis_known
  check (price_basis in ('unspecified', 'inc_vat', 'no_vat'));

alter table client_quotes
  add column if not exists price_basis text not null default 'unspecified';
alter table client_quotes
  drop constraint if exists clq_price_basis_known;
alter table client_quotes
  add constraint clq_price_basis_known
  check (price_basis in ('unspecified', 'inc_vat', 'no_vat'));

-- Backfill the client rows from their contractor row, so a price already on a
-- customer's list keeps its meaning if a contractor revises nothing.
update client_quotes clq
   set price_basis = cq.price_basis
  from contractor_quotes cq
 where cq.id = clq.contractor_quote_id
   and cq.price_basis <> 'unspecified'
   and clq.price_basis = 'unspecified';


-- ── sq_publish_quote: carry the basis onto the client row ────────────────
-- Unchanged from 20260918200000 apart from the price_basis column.
CREATE OR REPLACE FUNCTION public.sq_publish_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cq contractor_quotes%rowtype;
  v_js job_submissions%rowtype;
  v_rate numeric;
  v_label text;
  v_n int;
  v_ct contractors%rowtype;
begin
  select * into v_cq from contractor_quotes where id = p_quote_id;
  select * into v_js from job_submissions where id = v_cq.submission_id;
  select * into v_ct from contractors where id = v_cq.contractor_id;
  v_rate := app_config_num('sq_markup_rate', 0.10);

  -- Stable label: reuse this contractor's existing label on this submission,
  -- else allocate the next in arrival order.
  select contractor_display_label into v_label
    from client_quotes
   where submission_id = v_cq.submission_id and contractor_id = v_cq.contractor_id
   limit 1;
  if v_label is null then
    select count(distinct contractor_id) + 1 into v_n
      from client_quotes where submission_id = v_cq.submission_id;
    v_label := 'Contractor ' || case when v_n <= 26 then chr(64 + v_n) else v_n::text end;
  end if;

  insert into client_quotes (
    submission_id, contractor_quote_id, contractor_id,
    client_price_pence, markup_rate,
    client_rate_value_pence, client_rate_minimum_pence,
    contractor_display_label, contractor_rating_avg, contractor_rating_count,
    distance_miles, site_visit_required, valid_until, price_basis
  )
  select
    v_cq.submission_id, v_cq.id, v_cq.contractor_id,
    client_price_pence(v_cq.contractor_price_pence, v_rate), v_rate,
    -- Rate quotes: the rate itself is marked up to the penny (ceil); the
    -- headline indicative total above gets the full ceil-to-£5 treatment.
    case when v_cq.rate_value_pence is not null
         then ceil(v_cq.rate_value_pence * (1 + v_rate))::int end,
    case when v_cq.rate_minimum_pence is not null
         then ceil(v_cq.rate_minimum_pence * (1 + v_rate))::int end,
    v_label, v_ct.rating_avg, v_ct.rating_count,
    i.distance_miles, v_cq.site_visit_required, v_cq.valid_until, v_cq.price_basis
  from job_invitations i where i.id = v_cq.invitation_id;

  update job_invitations set status = 'priced' where id = v_cq.invitation_id;

  perform log_job_event(v_cq.submission_id, 'quote_received', null, null, 'contractor',
    v_cq.contractor_id, null,
    jsonb_build_object('quote_id', v_cq.id,
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate)));

  -- First price → quotes_receiving + immediate client email (§16a.1).
  if v_js.status = 'distributed' then
    update job_submissions set status = 'quotes_receiving', quotes_notified_at = now()
     where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'distributed', 'quotes_receiving',
      'system', null, null, '{}');
    insert into pending_emails (kind, to_email, payload)
    values ('sq_first_quote', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate),
      'contractor_label', v_label,
      'price_basis', v_cq.price_basis,
      'contact_name', v_js.contact_name,
      'sole_offer', v_js.first_refusal and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$function$;


-- ── submit_contractor_quote: accept and store the basis ─────────────────
-- The old 10-argument signature is dropped rather than left alongside: two
-- overloads reachable by the same named-argument RPC call is ambiguous.
-- p_price_basis defaults, so the email-parse caller (which cannot tell inc
-- from ex VAT) keeps working untouched and lands on 'unspecified'.
drop function if exists public.submit_contractor_quote(
  text, text, integer, integer, integer, boolean, text, date, text, boolean);

CREATE OR REPLACE FUNCTION public.submit_contractor_quote(p_token text, p_quote_type text, p_price_pence integer, p_rate_value_pence integer, p_rate_minimum_pence integer, p_site_visit boolean, p_notes text, p_valid_until date, p_source text, p_confirmed boolean, p_price_basis text DEFAULT 'unspecified')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if coalesce(p_price_basis, 'unspecified') not in ('unspecified','inc_vat','no_vat') then
    return jsonb_build_object('ok', false, 'reason', 'bad_basis');
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
    source, confirmed_by_contractor, confirm_token, price_basis
  ) values (
    v_js.id, v_inv.contractor_id, v_inv.id, p_quote_type,
    v_price, p_rate_value_pence, p_rate_minimum_pence,
    nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_site_visit, false),
    coalesce(p_valid_until, coalesce(v_js.expires_at::date, current_date + 7)),
    p_source, coalesce(p_confirmed, true), v_confirm_token,
    coalesce(p_price_basis, 'unspecified')
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
    'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
    'postcode_district', split_part(v_js.postcode, ' ', 1))
  from contractors ct where ct.id = v_inv.contractor_id;
  return jsonb_build_object('ok', true, 'quote_id', v_new_id, 'pending_confirm', true);
end;
$function$;

-- Re-apply the lockdown from 20260901100003. CREATE OR REPLACE keeps a
-- function's ACL, but the DROP above threw it away, and a fresh function is
-- EXECUTE-to-PUBLIC by default — which would put this SECURITY DEFINER write
-- within reach of anon through PostgREST. Signature now has the 11th argument.
revoke execute on function
  submit_contractor_quote(text,text,int,int,int,boolean,text,date,text,boolean,text)
  from public;
grant execute on function
  submit_contractor_quote(text,text,int,int,int,boolean,text,date,text,boolean,text)
  to service_role;


-- ════════════════════════════════════════════════════════════════════════
-- Email payloads: carry the basis to the renderer.
--
-- The three functions below are the LATEST definitions, lifted verbatim from
-- the migrations that own them and patched only to add a 'price_basis' key
-- (begin_acceptance and award_submission) or to read the column and pass it on
-- (sq_open_balance). Bodies are otherwise byte-identical to what is deployed.
--
-- All three are CREATE OR REPLACE with unchanged signatures, so their existing
-- grants survive — unlike submit_contractor_quote above, which had to be
-- dropped for its new argument and has its ACL restored explicitly.
--
-- begin_acceptance / sq_open_balance read client_quotes.price_basis, which the
-- ALTER at the top of this migration adds. Order matters; don't reorder.
-- ════════════════════════════════════════════════════════════════════════

-- ── begin_acceptance (from 20260910120000_deposit_and_balance.sql) ──
-- sq_payment_link quotes three figures (total, deposit, balance) at the
-- moment the customer commits money. v_q is already a client_quotes row.
create or replace function begin_acceptance(
  p_client_token text,
  p_client_quote_id uuid,
  p_session_id text,
  p_session_expires_at timestamptz,
  p_checkout_url text,
  p_deposit_pence int default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
     or v_q.valid_until < current_date then
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
    'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'deposit_pence', v_dep);
end;
$$;

-- ── sq_open_balance (from 20260910120000_deposit_and_balance.sql) ──
-- sq_balance_due itemises total / deposit paid / balance. The existing
-- single-column select is widened rather than a new query added.
create or replace function sq_open_balance(p_submission_id uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js      job_submissions%rowtype;
  v_price   int;
  v_basis   text;
  v_paid    int;
  v_balance int;
  v_dep     job_payments%rowtype;
  v_days    int;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.accepted_client_quote_id is null then return 0; end if;

  -- Already open (or already settled) — nothing to do.
  if exists (select 1 from job_payments
              where submission_id = p_submission_id and kind = 'balance'
                and status in ('due', 'failed', 'paid', 'pending')) then
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

  insert into job_payments (submission_id, client_quote_id, amount_pence, status, kind,
                            expires_at, due_at, stripe_customer_id, stripe_payment_method_id)
  values (p_submission_id, v_js.accepted_client_quote_id, v_balance, 'due', 'balance',
          now() + make_interval(days => v_days), now() + make_interval(days => v_days),
          v_dep.stripe_customer_id, v_dep.stripe_payment_method_id);

  perform log_job_event(p_submission_id, 'balance_due', null, null, 'system', null,
    format('balance of %s pence due within %s days of sign-off', v_balance, v_days),
    jsonb_build_object('amount_pence', v_balance, 'total_pence', v_price,
                       'deposit_pence', v_paid, 'terms_days', v_days));

  perform sq_notify_once(p_submission_id, coalesce(v_js.contact_email, 'unknown'),
    'sq_balance_due', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
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
$$;

-- ── award_submission (from 20260918200000_service_label.sql) ──
-- sq_award_won tells the contractor their own price back. Contractor-facing,
-- so it echoes the basis they themselves picked.
CREATE OR REPLACE FUNCTION public.award_submission(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      jsonb_build_object('service', sq_service_label(v_js.service_id, v_js.service_verbatim),
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
      'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
      'contact_name', v_js.contact_name,
      'contact_phone', v_js.contact_phone,
      'contact_email', v_js.contact_email,
      'postcode', v_js.postcode,
      'gate_w3w', v_js.gate_w3w,
      'contractor_price_pence', v_cq.contractor_price_pence,
      'price_basis', v_cq.price_basis));

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email,'unknown'), 'sq_award_client',
    v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name', v_ct.business_name,
      'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'awarded_to', v_q.contractor_id);
end;
$function$;

-- ── The two balance emails (from 20260910120000_deposit_and_balance.sql) ──
-- Label only. Neither has a quote rowtype in scope, so each reaches the basis
-- through job_payments.client_quote_id — the same row the payment was raised
-- against, so it cannot drift from the price the customer accepted.

create or replace function sq_settle_balance(p_payment_id uuid, p_intent_id text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pay job_payments%rowtype;
  v_js  job_submissions%rowtype;
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

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function sq_fail_balance(
  p_payment_id uuid, p_error text, p_final boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;
