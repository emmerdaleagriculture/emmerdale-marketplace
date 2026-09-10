-- ============================================================================
-- Payment model: 100% up front  ->  15% deposit + 85% balance on sign-off.
--
-- Until now a customer paid the whole client price into a Checkout session and
-- the award fired when that cleared. Emmerdale held the money and released it
-- to the contractor by hand. From here:
--
--   accept  -> Checkout for sq_deposit_rate of the price, card SAVED
--   award   -> on the deposit clearing, exactly as before
--   sign-off-> the balance falls due, payable within 7 days, and is charged
--              off-session to the saved card
--
-- ── The rollout flag ────────────────────────────────────────────────────────
-- sq_deposit_rate = 1.0 reproduces the old behaviour EXACTLY: the deposit is
-- the whole price, the balance computes to zero, no balance row is ever opened
-- and no off-session charge is ever attempted. That is the safe setting to
-- deploy on. Set it to 0.15 to switch the new model on, and back to 1.0 to
-- stand it down — no deploy either way.
--
-- ── Why the balance is a queued row, not an inline charge ───────────────────
-- Sign-off happens in two places: confirm_completion_by_client (the customer
-- pressing the button) and auto_confirm_due_completions (an hourly cron, terms
-- 7.2). Neither can call Stripe — one is a SQL function behind a server
-- action, the other is pg_cron. So sign-off OPENS a balance row marked 'due'
-- and a worker charges it. One mechanism covers both paths, plus the retries
-- and the emailed fallback link that an off-session charge always eventually
-- needs.
--
-- ── Rounding ────────────────────────────────────────────────────────────────
-- deposit = round(price x rate), balance = price - deposit. Deliberately NOT
-- client_price_pence()'s ceil-to-£5: two amounts that have to sum back to the
-- price exactly cannot both be rounded outward.
-- ============================================================================

insert into app_config (key, value) values
  -- 1.0 = today's behaviour. Flip to 0.15 to go live with deposits.
  ('sq_deposit_rate',      '1.0'),
  ('sq_balance_terms_days', '7'),
  -- Max off-session attempts before we stop trying and wait for the customer
  -- to use the emailed link. Card declines do not get better by repetition.
  ('sq_balance_max_attempts', '3')
on conflict (key) do nothing;

-- The cancellation fee is now the deposit: "cancel and you lose the 15% you
-- paid". Kept as its own key rather than reusing sq_deposit_rate so that the
-- rollout flag (1.0) cannot turn a cancellation into confiscation of the whole
-- payment. In normal operation these two are the same number.
update app_config set value = '0.15', updated_at = now()
 where key = 'sq_cancellation_fee_rate';
insert into app_config (key, value) values ('sq_cancellation_fee_rate', '0.15')
on conflict (key) do nothing;

-- ── The split ───────────────────────────────────────────────────────────────
create or replace function sq_deposit_pence(p_client_price_pence int, p_rate numeric)
returns int language sql immutable set search_path = public as $$
  select least(
           greatest(round(p_client_price_pence::numeric * p_rate)::int, 0),
           greatest(p_client_price_pence, 0)
         );
$$;

comment on function sq_deposit_pence(int, numeric) is
  'Deposit taken at acceptance. The balance is always price - deposit, so the '
  'two sum back to the price exactly. Never negative, never above the price.';

-- What the customer is about to be asked for. The server action reads this
-- BEFORE creating the Checkout session so the session is always for the
-- SQL-canonical amount; begin_acceptance then re-derives it and refuses a
-- mismatch, so a stale page can never open a session for the wrong money.
create or replace function sq_payment_plan(p_client_quote_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_price int;
  v_rate  numeric;
  v_dep   int;
begin
  select client_price_pence into v_price from client_quotes where id = p_client_quote_id;
  if v_price is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_rate := app_config_num('sq_deposit_rate', 1.0);
  v_dep  := sq_deposit_pence(v_price, v_rate);
  return jsonb_build_object(
    'ok', true,
    'total_pence',   v_price,
    'deposit_pence', v_dep,
    'balance_pence', v_price - v_dep,
    'deposit_rate',  v_rate,
    'terms_days',    app_config_num('sq_balance_terms_days', 7)::int);
end;
$$;
revoke execute on function sq_payment_plan(uuid) from public, anon, authenticated;
grant execute on function sq_payment_plan(uuid) to service_role;

-- ── job_payments: one row per movement of money, not one per job ────────────
-- A balance charge is a bare PaymentIntent with no Checkout session, so the
-- session id can no longer be mandatory. Postgres allows many NULLs under a
-- unique constraint, so the existing uniqueness still holds for real sessions.
alter table job_payments
  add column if not exists kind                     text not null default 'deposit',
  add column if not exists due_at                   timestamptz,
  add column if not exists attempts                 int not null default 0,
  add column if not exists last_attempt_at          timestamptz,
  add column if not exists last_error               text,
  add column if not exists stripe_customer_id       text,
  add column if not exists stripe_payment_method_id text;

alter table job_payments alter column stripe_checkout_session_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_payments_kind_check') then
    alter table job_payments add constraint job_payments_kind_check
      check (kind in ('deposit', 'balance'));
  end if;
end $$;

-- 'due'    = owed and still the worker's to collect — including after a
--            failed attempt it means to retry. Only a balance row is ever in it;
--            a deposit is 'pending' from the moment its Checkout session exists.
-- 'failed' = the worker has GIVEN UP and the customer has to act. The two are
--            kept strictly apart because the job page offers a "pay it yourself"
--            button on 'failed' and nothing on 'due': a row the worker might
--            still charge must never also be payable by hand, or one balance
--            can be taken twice.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'job_payments'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%partially_refunded%';
  if v_name is not null then
    execute format('alter table job_payments drop constraint %I', v_name);
  end if;
  alter table job_payments add constraint job_payments_status_check
    check (status in ('pending','due','paid','expired','failed','refunded','partially_refunded'));
end $$;

-- The worker's scan: due and failed balances, oldest first.
create index if not exists job_payments_balance_queue_idx
  on job_payments (status, due_at)
  where kind = 'balance' and status in ('due', 'failed');

-- ── The premium payout tier (£40/mo), not yet sold ──────────────────────────
-- Payout is gated on the customer's balance settling AND the contractor's
-- invoice arriving. The premium tier's whole product is being paid before the
-- customer's money lands — Emmerdale fronting it. Nothing reads this yet
-- beyond the admin "ready to pay" view; it exists so that turning the tier on
-- is a config change rather than a schema change mid-flight.
alter table contractors
  add column if not exists payout_before_balance boolean not null default false;

comment on column contractors.payout_before_balance is
  'Premium tier: pay this contractor on sign-off rather than waiting for the '
  'customer balance to settle. Emmerdale carries the 85% until it does.';

-- ── begin_acceptance: the deposit, not the whole price ──────────────────────
-- Dropped first, not just replaced: adding a defaulted 6th parameter makes a
-- NEW function by Postgres's rules, and the old five-argument one — the one
-- that inserts the whole price as the amount due — would survive alongside it,
-- still granted to service_role, waiting for a caller.
drop function if exists begin_acceptance(text, uuid, text, timestamptz, text);

-- p_deposit_pence is what the caller opened a Checkout session for. It is
-- checked against the SQL-canonical figure rather than trusted: a page held
-- open across a rate change must not be able to book a job for the old split.
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
    'contact_name', v_js.contact_name));

  return jsonb_build_object('ok', true, 'deposit_pence', v_dep);
end;
$$;

revoke execute on function begin_acceptance(text, uuid, text, timestamptz, text, int)
  from public, anon, authenticated;
grant execute on function begin_acceptance(text, uuid, text, timestamptz, text, int)
  to service_role;

-- ── Opening the balance at sign-off ─────────────────────────────────────────
-- Idempotent on every axis: a job with a zero balance (rate 1.0, or a customer
-- who somehow paid in full) opens nothing, and a second sign-off finds the row
-- already there. Returns the balance opened, in pence, for the log.
create or replace function sq_open_balance(p_submission_id uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js      job_submissions%rowtype;
  v_price   int;
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

  select client_price_pence into v_price
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
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id)));

  return v_balance;
end;
$$;
revoke execute on function sq_open_balance(uuid) from public, anon, authenticated;
grant execute on function sq_open_balance(uuid) to service_role;

-- ── Sign-off, both routes, now opens the balance ────────────────────────────
create or replace function confirm_completion_by_client(p_submission_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js      job_submissions%rowtype;
  v_email   text;
  v_balance int;
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

  -- Sign-off is what makes the rest of the money owed (terms 7.2).
  v_balance := sq_open_balance(v_js.id);

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email, 'sq_completion_confirmed', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;

  perform sq_notify_once(v_js.id, coalesce(v_js.contact_email, 'unknown'),
    'sq_rating_request', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'contractor_business_name',
        (select business_name from contractors where id = v_js.awarded_contractor_id),
      'contact_name', v_js.contact_name));
  return jsonb_build_object('ok', true, 'balance_pence', v_balance);
end;
$$;
revoke execute on function confirm_completion_by_client(uuid) from public;
grant execute on function confirm_completion_by_client(uuid) to service_role;

create or replace function auto_confirm_due_completions() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  r      record;
  v_done int := 0;
  v_email text;
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

      -- An auto-confirmed job owes the balance exactly as a hand-confirmed one
      -- does; the customer's silence is treated as agreement by 7.2, and that
      -- includes agreement to pay.
      perform sq_open_balance(r.id);

      select email into v_email from contractors where id = r.awarded_contractor_id;
      if v_email is not null then
        perform sq_notify_once(r.id, v_email, 'sq_completion_confirmed', v_email,
          jsonb_build_object('contact_name', r.contact_name));
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
revoke execute on function auto_confirm_due_completions() from public, anon, authenticated;
grant execute on function auto_confirm_due_completions() to service_role;

-- ── The worker's two callbacks ──────────────────────────────────────────────
-- Claim a batch of balances to charge. SKIP LOCKED plus an immediate attempts
-- bump means two overlapping worker runs can never charge the same card twice.
create or replace function sq_claim_due_balances(p_limit int default 20)
returns table (payment_id uuid, submission_id uuid, amount_pence int,
               stripe_customer_id text, stripe_payment_method_id text,
               attempts int, max_attempts int, contact_email text, client_token text)
language plpgsql volatile security definer set search_path = public as $$
declare v_max int := app_config_num('sq_balance_max_attempts', 3)::int;
begin
  return query
  with claimed as (
    select p.id
      from job_payments p
     where p.kind = 'balance'
       and p.status = 'due'
       and p.attempts < v_max
       -- Back off between attempts: an hour per attempt already made. A card
       -- declined a minute ago declines again a minute later.
       and (p.last_attempt_at is null
            or p.last_attempt_at < now() - make_interval(hours => p.attempts))
     order by p.created_at
     limit p_limit
     for update skip locked
  )
  update job_payments p
     set attempts = p.attempts + 1, last_attempt_at = now()
    from claimed c, job_submissions js
   where p.id = c.id and js.id = p.submission_id
  returning p.id, p.submission_id, p.amount_pence, p.stripe_customer_id,
            p.stripe_payment_method_id, p.attempts, v_max, js.contact_email, js.client_token;
end;
$$;
revoke execute on function sq_claim_due_balances(int) from public, anon, authenticated;
grant execute on function sq_claim_due_balances(int) to service_role;

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
      'amount_pence', v_pay.amount_pence));

  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function sq_settle_balance(uuid, text) from public, anon, authenticated;
grant execute on function sq_settle_balance(uuid, text) to service_role;

-- A failed attempt. Not final: the row stays 'due' with the error recorded and
-- the worker retries after its back-off. Final: the worker has given up, the
-- row becomes 'failed', and the customer is pointed at the job page — the only
-- place a balance can be paid by hand, and only in this state.
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
        'due_at', v_pay.due_at));
    perform sq_notify_once(v_pay.submission_id, '__admin__', 'sq_balance_stuck', '__admin__',
      jsonb_build_object('submission_id', v_pay.submission_id,
                         'amount_pence', v_pay.amount_pence, 'error', left(coalesce(p_error,''), 200)));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function sq_fail_balance(uuid, text, boolean) from public, anon, authenticated;
grant execute on function sq_fail_balance(uuid, text, boolean) to service_role;

-- ── Cancellation: the deposit IS the fee ────────────────────────────────────
-- 9.2 used to be "15% of our margin plus the Stripe fee, refund the rest",
-- which only made sense when the customer had handed over the whole price.
-- With a 15% deposit the arithmetic is the terms: you lose what you put down.
--
-- The rate is read rather than assumed to equal the deposit so that the
-- rollout flag (sq_deposit_rate = 1.0) cannot turn a cancellation into
-- confiscation of a full payment — at 1.0 this still retains 15% and refunds
-- the rest, which is what the customer agreed to.
create or replace function sq_cancellation_split(p_submission_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_price int;
  v_paid  int;
  v_fee   int;
begin
  select * into v_js from job_submissions where id = p_submission_id;
  if not found or v_js.accepted_client_quote_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select client_price_pence into v_price
    from client_quotes where id = v_js.accepted_client_quote_id;
  select coalesce(sum(amount_pence), 0) into v_paid
    from job_payments where submission_id = p_submission_id and status = 'paid';

  v_fee := least(round(v_price::numeric * app_config_num('sq_cancellation_fee_rate', 0.15))::int,
                 v_paid);
  return jsonb_build_object('ok', true, 'total_pence', v_price, 'paid_pence', v_paid,
                            'fee_pence', v_fee, 'refund_pence', v_paid - v_fee);
end;
$$;
revoke execute on function sq_cancellation_split(uuid) from public, anon, authenticated;
grant execute on function sq_cancellation_split(uuid) to service_role;

create or replace function cancel_job_by_client(
  p_submission_id uuid, p_refund_pence int, p_fee_pence int
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_js    job_submissions%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.status not in ('awarded', 'contacted', 'scheduled') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_js.status);
  end if;

  update job_submissions set status = 'cancelled' where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', v_js.status, 'cancelled', 'client', null,
    'cancelled on the job page (terms 9.1)',
    jsonb_build_object('refund_pence', p_refund_pence, 'fee_pence', p_fee_pence));

  -- A balance that was never charged dies with the job — cancelling before the
  -- work starts must never leave 85% queued against a card.
  update job_payments set status = 'expired', last_error = 'job cancelled'
   where submission_id = v_js.id and kind = 'balance' and status in ('due', 'failed', 'pending');

  update job_payments
     set status = case when p_refund_pence > 0 then 'partially_refunded' else 'paid' end,
         refunded_pence = nullif(p_refund_pence, 0),
         refunded_at = case when p_refund_pence > 0 then now() else null end
   where submission_id = v_js.id and kind = 'deposit' and status = 'paid';

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email, 'sq_job_cancelled_contractor', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;
  perform sq_notify_once(v_js.id, '__admin__', 'sq_job_cancelled_admin', '__admin__',
    jsonb_build_object('submission_id', v_js.id, 'refund_pence', p_refund_pence,
                       'fee_pence', p_fee_pence));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function cancel_job_by_client(uuid, int, int) from public, anon, authenticated;
grant execute on function cancel_job_by_client(uuid, int, int) to service_role;

-- ── Payout readiness, for the admin money screen ────────────────────────────
-- "Both: balance in, invoice received." A premium contractor
-- (payout_before_balance) skips the first condition.
create or replace view sq_payout_ready as
  select js.id                              as submission_id,
         js.awarded_contractor_id           as contractor_id,
         c.business_name,
         c.payout_before_balance,
         cq.contractor_price_pence          as owed_pence,
         js.contractor_invoice_at,
         (select coalesce(sum(p.amount_pence), 0) from job_payments p
           where p.submission_id = js.id and p.status = 'paid')            as collected_pence,
         (select clq.client_price_pence from client_quotes clq
           where clq.id = js.accepted_client_quote_id)                     as total_pence,
         js.status
    from job_submissions js
    join contractors c on c.id = js.awarded_contractor_id
    left join contractor_quotes cq
           on cq.submission_id = js.id and cq.contractor_id = js.awarded_contractor_id
   where js.status in ('completed', 'paid');

comment on view sq_payout_ready is
  'Jobs finished and awaiting a contractor payout. Ready to pay when the '
  'invoice is in AND collected_pence = total_pence — or the invoice alone for '
  'a payout_before_balance (premium) contractor.';

-- ── Balances that have run past their terms ─────────────────────────────────
create or replace function sq_alert_overdue_balances() returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in
    select p.id, p.submission_id, p.amount_pence, p.due_at
      from job_payments p
     where p.kind = 'balance' and p.status in ('due', 'failed')
       and p.due_at < now()
  loop
    if sq_notify_once(r.submission_id, '__admin__', 'sq_balance_overdue', '__admin__',
         jsonb_build_object('submission_id', r.submission_id,
                            'amount_pence', r.amount_pence, 'due_at', r.due_at)) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function sq_alert_overdue_balances() from public, anon, authenticated;
grant execute on function sq_alert_overdue_balances() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'alert-overdue-balances') then
    perform cron.unschedule('alert-overdue-balances');
  end if;
  perform cron.schedule('alert-overdue-balances', '50 8 * * *',
    $ob$select sq_alert_overdue_balances();$ob$);
end $$;

-- ── admin_dashboard: one row per submission in the money CTE ────────────────
-- Recreated wholesale rather than patched, because the money CTE is inline.
-- With a deposit row AND a balance row per job, every per-job figure that
-- joined it — margin, payouts owed, held, and the per-county job COUNT —
-- silently doubled the moment a balance opened.
create or replace function admin_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
with
  since30 as (select now() - interval '30 days' as t),
  since7  as (select now() - interval '7 days'  as t),
  -- A "job" here is a submission the customer actually confirmed. Drafts and
  -- abandoned parses are funnel leakage, counted separately.
  js as (select * from job_submissions where status not in ('draft','abandoned')),
  -- ONE ROW PER SUBMISSION, not per payment. A job now has a deposit row and
  -- a balance row, and every figure below that multiplies by a per-job price
  -- (margin, payouts owed, held, and the per-county job COUNT) would count the
  -- job twice the moment its balance opened. amount_pence is what has actually
  -- been collected across both.
  money as (
    select p.submission_id,
           sum(p.amount_pence)                as amount_pence,
           max(p.paid_at)                     as paid_at,
           sum(coalesce(p.refunded_pence, 0)) as refunded_pence,
           max(cq.client_price_pence)         as client_price_pence,
           max(ctq.contractor_price_pence)    as contractor_price_pence
      from job_payments p
      join client_quotes cq on cq.id = p.client_quote_id
      join contractor_quotes ctq on ctq.id = cq.contractor_quote_id
     where p.status in ('paid','partially_refunded','refunded')
     group by p.submission_id
  ),
  -- Owed by customers on finished jobs and not yet taken.
  outstanding as (
    select coalesce(sum(amount_pence), 0) as pence, count(*) as n
      from job_payments
     where kind = 'balance' and status in ('due', 'failed')
  )
select jsonb_build_object(

  -- ── Funnel ──────────────────────────────────────────────────────────────
  'funnel', jsonb_build_object(
    'landing_views_30d', (select count(*) from landing_views where created_at >= (select t from since30)),
    'started_30d',       (select count(*) from job_submissions where created_at >= (select t from since30)),
    'confirmed_30d',     (select count(*) from js where confirmed_at >= (select t from since30)),
    'distributed_30d',   (select count(*) from js where confirmed_at >= (select t from since30) and status not in ('confirmed','no_matches')),
    'priced_30d',        (select count(distinct submission_id) from client_quotes cq join js on js.id = cq.submission_id where js.confirmed_at >= (select t from since30)),
    'paid_30d',          (select count(distinct submission_id) from money m join js on js.id = m.submission_id where js.confirmed_at >= (select t from since30)),
    'completed_30d',     (select count(*) from js where confirmed_at >= (select t from since30) and status in ('completed','paid')),
    'confirmed_all',     (select count(*) from js),
    'paid_all',          (select count(distinct submission_id) from money),
    'completed_all',     (select count(*) from js where status in ('completed','paid'))
  ),

  -- ── Live pipeline ───────────────────────────────────────────────────────
  'pipeline', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from
                 (select status, count(*) n from js
                   where status not in ('completed','paid','cancelled','no_matches','no_quotes','expired')
                   group by status) t),
  'attention', jsonb_build_object(
    'awaiting_customer_confirm', (select count(*) from js where status = 'completed_by_contractor'),
    'awaiting_payment',          (select count(*) from js where status = 'accepted_awaiting_payment'),
    'no_matches',                (select count(*) from js where status = 'no_matches'),
    'no_quotes_48h',             (select count(*) from js where status = 'distributed' and distributed_at < now() - interval '48 hours'),
    'awaiting_invoice',          (select count(*) from js where status in ('completed','paid') and contractor_invoice_path is null),
    'invoices_to_pay',           (select count(*) from js where status in ('completed','paid') and contractor_invoice_path is not null)
  ),

  -- ── Money ───────────────────────────────────────────────────────────────
  'money', jsonb_build_object(
    'gross_pence_30d',   (select coalesce(sum(amount_pence),0) from money where paid_at >= (select t from since30)),
    'gross_pence_all',   (select coalesce(sum(amount_pence),0) from money),
    'margin_pence_30d',  (select coalesce(sum(client_price_pence - contractor_price_pence),0) from money where paid_at >= (select t from since30)),
    'margin_pence_all',  (select coalesce(sum(client_price_pence - contractor_price_pence),0) from money),
    'refunded_pence_all',(select coalesce(sum(refunded_pence),0) from money),
    'payouts_owed_pence',(select coalesce(sum(m.contractor_price_pence),0) from money m join js on js.id = m.submission_id where js.status in ('completed','paid')),
    'held_pence',        (select coalesce(sum(m.amount_pence),0) from money m join js on js.id = m.submission_id where js.status in ('awarded','contacted','scheduled','in_progress','completed_by_contractor')),
    'outstanding_pence', (select pence from outstanding),
    'outstanding_count', (select n from outstanding),
    'avg_job_pence',     (select coalesce(avg(client_price_pence),0)::int from money)
  ),

  -- ── People ──────────────────────────────────────────────────────────────
  'customers', jsonb_build_object(
    'total',        (select count(*) from customers),
    'new_30d',      (select count(*) from customers where created_at >= (select t from since30)),
    'with_a_job',   (select count(distinct customer_id) from js where customer_id is not null),
    'repeat',       (select count(*) from (select customer_id from js where customer_id is not null group by customer_id having count(*) > 1) r),
    'schedules_active', (select count(*) from job_schedules where active),
    'unclaimed_jobs',   (select count(*) from js where customer_id is null and contact_email is not null)
  ),
  'contractors', jsonb_build_object(
    'total',        (select count(*) from contractors),
    'approved',     (select count(*) from contractors where status = 'approved'),
    'vetted',       (select count(*) from contractors where status = 'approved' and vetted_at is not null),
    'pending',      (select count(*) from contractors where status = 'pending'),
    'suspended',    (select count(*) from contractors where status = 'suspended'),
    'new_30d',      (select count(*) from contractors where created_at >= (select t from since30)),
    'invited_30d',  (select count(distinct contractor_id) from job_invitations where sent_at >= (select t from since30)),
    'priced_30d',   (select count(distinct contractor_id) from contractor_quotes where created_at >= (select t from since30)),
    'won_30d',      (select count(distinct awarded_contractor_id) from js where awarded_at >= (select t from since30)),
    'rating_avg',   (select round(avg(stars)::numeric, 2) from contractor_ratings),
    'ratings',      (select count(*) from contractor_ratings)
  ),

  -- ── Response ────────────────────────────────────────────────────────────
  'response', jsonb_build_object(
    'invite_to_first_price_median_hours', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (cq.created_at - i.sent_at))/3600))::numeric, 1)
        from contractor_quotes cq join job_invitations i on i.id = cq.invitation_id),
    'invites_per_job', (select round(avg(n)::numeric,1) from (select count(*) n from job_invitations group by submission_id) t),
    'prices_per_job',  (select round(avg(n)::numeric,1) from (select count(*) n from client_quotes group by submission_id) t),
    'decline_rate_pct',(select case when count(*)=0 then null else round(100.0*count(*) filter (where status='declined')/count(*),0) end from job_invitations)
  ),

  -- ── Locations ───────────────────────────────────────────────────────────
  -- Demand and supply side by side per county, so the gaps show.
  'counties', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'region', c.region,
      'jobs', coalesce(j.jobs,0), 'jobs_30d', coalesce(j.jobs_30d,0),
      'no_matches', coalesce(j.no_matches,0),
      'paid_pence', coalesce(j.paid_pence,0),
      'contractors', coalesce(k.contractors,0),
      'customers', coalesce(j.customers,0)
    ) order by coalesce(j.jobs,0) desc, coalesce(k.contractors,0) desc, c.name), '[]'::jsonb)
    from counties c
    left join (
      select js.county_id,
             count(*) jobs,
             count(*) filter (where js.confirmed_at >= (select t from since30)) jobs_30d,
             count(*) filter (where js.status = 'no_matches') no_matches,
             count(distinct js.customer_id) customers,
             coalesce(sum(m.amount_pence),0) paid_pence
        from js left join money m on m.submission_id = js.id
       group by js.county_id) j on j.county_id = c.id
    left join (
      select cc.county_id, count(*) contractors
        from contractor_counties cc join contractors ct on ct.id = cc.contractor_id
       where ct.status = 'approved' and ct.vetted_at is not null
       group by cc.county_id) k on k.county_id = c.id
    where coalesce(j.jobs,0) > 0 or coalesce(k.contractors,0) > 0
  ),
  'unplaced_jobs', (select count(*) from js where county_id is null),

  -- ── Trend: confirmed jobs per week, last 12 weeks ────────────────────────
  'weekly', (
    select coalesce(jsonb_agg(jsonb_build_object('week', w, 'jobs', coalesce(n,0), 'paid', coalesce(p,0)) order by w), '[]'::jsonb)
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w
    left join (select date_trunc('week', confirmed_at) wk, count(*) n from js group by 1) a on a.wk = w
    left join (select date_trunc('week', paid_at) wk, count(*) p from money group by 1) b on b.wk = w
  ),

  -- ── Email health, last 7 days ────────────────────────────────────────────
  'email', jsonb_build_object(
    'sent_7d',      (select count(*) from pending_emails where status='sent' and created_at >= (select t from since7)),
    'delivered_7d', (select count(*) from pending_emails where delivery_status='delivered' and created_at >= (select t from since7)),
    'bounced_7d',   (select count(*) from pending_emails where delivery_status in ('bounced','failed','suppressed') and created_at >= (select t from since7)),
    'pending',      (select count(*) from pending_emails where status='pending'),
    'failed',       (select count(*) from pending_emails where status='failed')
  ),

  -- ── The old board, until it is switched off ─────────────────────────────
  'legacy', jsonb_build_object(
    'board_jobs_open', (select count(*) from jobs where status = 'open'),
    'board_jobs_total',(select count(*) from jobs)
  ),

  'generated_at', now()
);
$$;
