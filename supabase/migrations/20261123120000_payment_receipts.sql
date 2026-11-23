-- Receipts for every payment made to us (2026-11-23).
--
-- Until now a payment produced a confirmation ("Booked", "Paid in full") but
-- nothing a customer or contractor could file: no date, no reference, no
-- method, no company details. This adds one receipt email per payment:
--
--   * job payments — the deposit, a card balance (off-session charge or the
--     emailed link) and a balance received by bank transfer all end in
--     job_payments.status = 'paid', so a trigger on that transition covers
--     every route without touching award_submission or sq_settle_balance;
--   * memberships — issued from the app (Stripe invoice.paid webhook, with
--     the nightly premium-sync as the sweep), through sq_issue_receipt below.
--
-- payment_receipts is the ledger: one row per payment, keyed by its source,
-- so a webhook replay or the nightly sweep can never send a second receipt.
-- It also holds the receipt number the email quotes.

-- Where a contractor's receipts go when it isn't the account address: the
-- bookkeeper or accounts inbox (first asked for 2026-11-23). Null = the
-- account email. Set by the contractor in Settings › Business details.
alter table public.contractors add column if not exists receipt_email text;

create table if not exists public.payment_receipts (
  receipt_key text primary key,          -- 'job_payment:<uuid>' | 'stripe_invoice:<in_…>'
  receipt_no  text not null unique,
  kind        text not null,             -- 'job' | 'membership'
  to_email    text not null,
  amount_pence integer not null,
  paid_at     timestamptz not null,
  submission_id uuid references public.job_submissions(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.payment_receipts enable row level security;
-- No policies: service role only. Default privileges grant anon/authenticated
-- directly here, so revoke from them by name (revoke … from public is a no-op).
revoke all on public.payment_receipts from anon, authenticated;

/**
 * Record a receipt and queue its email, once per receipt_key. Returns true
 * when this call issued it, false when it had already been issued.
 */
create or replace function public.sq_issue_receipt(
  p_key text, p_receipt_no text, p_kind text, p_email_kind text, p_to_email text,
  p_amount_pence integer, p_paid_at timestamptz, p_submission_id uuid,
  p_contractor_id uuid, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_to_email is null or p_to_email = '' or p_amount_pence is null or p_amount_pence <= 0 then
    return false;
  end if;
  insert into payment_receipts (receipt_key, receipt_no, kind, to_email, amount_pence, paid_at,
                                submission_id, contractor_id)
  values (p_key, p_receipt_no, p_kind, p_to_email, p_amount_pence, p_paid_at,
          p_submission_id, p_contractor_id)
  on conflict (receipt_key) do nothing;
  if not found then return false; end if;

  insert into pending_emails (kind, to_email, payload)
  values (p_email_kind, p_to_email,
          coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
            'receipt_no', p_receipt_no,
            'amount_pence', p_amount_pence,
            'paid_at', p_paid_at)
          || case when p_submission_id is null then '{}'::jsonb
                  else jsonb_build_object('submission_id', p_submission_id) end);
  return true;
end;
$$;

revoke all on function public.sq_issue_receipt(text, text, text, text, text, integer, timestamptz, uuid, uuid, jsonb)
  from public, anon, authenticated;

/** The job-payment receipt, fired when a row first becomes 'paid'. */
create or replace function public.sq_job_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_js job_submissions%rowtype;
  v_contractor text;
  v_basis text;
  v_paid int;
  v_open int;
begin
  select * into v_js from job_submissions where id = new.submission_id;
  if not found or v_js.contact_email is null then return new; end if;

  select c.business_name into v_contractor from contractors c where c.id = v_js.awarded_contractor_id;
  select price_basis into v_basis from client_quotes where id = new.client_quote_id;

  -- Paid to date includes this row (the trigger runs after the update);
  -- outstanding is whatever is still being asked for.
  select coalesce(sum(amount_pence - coalesce(refunded_pence, 0)), 0) into v_paid
    from job_payments where submission_id = new.submission_id and status = 'paid';
  select coalesce(sum(amount_pence), 0) into v_open
    from job_payments where submission_id = new.submission_id
     and status in ('requested', 'due', 'failed');

  begin
    perform sq_issue_receipt(
      'job_payment:' || new.id,
      'EA-R-' || upper(left(replace(new.id::text, '-', ''), 8)),
      'job', 'sq_receipt', v_js.contact_email, new.amount_pence,
      coalesce(new.paid_at, now()), new.submission_id, v_js.awarded_contractor_id,
      jsonb_build_object(
        'contact_name', v_js.contact_name,
        'client_token', v_js.client_token,
        'payment_kind', new.kind,
        -- sq_settle_balance(…, null) is the bank-transfer route; every
        -- Stripe route (card, Klarna, wallets) leaves a pi_/cs_ id on the
        -- row, and a deposit only ever comes through Checkout.
        'method', case when new.kind = 'deposit' or new.stripe_payment_intent_id is not null
                       then 'online' else 'bank_transfer' end,
        'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
        'postcode_district', split_part(v_js.postcode, ' ', 1),
        'contractor_business_name', v_contractor,
        'price_basis', v_basis,
        'paid_to_date_pence', v_paid,
        'outstanding_pence', v_open));
  exception when others then
    -- A receipt must never undo a settlement: the money has been taken.
    raise warning 'receipt for job payment % not issued: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Only on the move INTO 'paid', so a later write that happens to set the
-- status again (paid → paid) can't issue a receipt for an old payment.
-- Rows paid before this migration never get one.
drop trigger if exists job_payment_receipt on public.job_payments;
drop trigger if exists job_payment_receipt_ins on public.job_payments;
create trigger job_payment_receipt
  after update of status on public.job_payments
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.sq_job_payment_receipt();
create trigger job_payment_receipt_ins
  after insert on public.job_payments
  for each row
  when (new.status = 'paid')
  execute function public.sq_job_payment_receipt();
