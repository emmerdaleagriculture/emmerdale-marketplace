-- The balance is requested from the customer, not taken from the saved card (2026-10-16).
--
-- Every off-session balance charge since the first (25 Sep) has been declined
-- with a generic "The payment failed." — three customers in one day. Tom's
-- call: "we've got to assume that saved cards won't allow payments to be
-- taken given the size of the average transaction." So at sign-off the
-- customer is asked to pay — card via the job page (where they are present
-- for any bank check) or bank transfer with the EA- reference — instead of
-- being told the card will be charged and then, an hour later, that it wasn't.
--
-- New balance status 'requested': the customer's to pay, never the worker's.
-- The worker only ever claims 'due', so a requested balance cannot be charged
-- twice. app_config.sq_balance_auto_charge (0) switches the old path back on.
-- Everything that keyed on ('due','failed') now includes 'requested'.

alter table public.job_payments drop constraint job_payments_status_check;
alter table public.job_payments add constraint job_payments_status_check
  check (status = any (array['pending','due','requested','paid','expired','failed','refunded','partially_refunded']));

insert into public.app_config (key, value) values ('sq_balance_auto_charge', '0'::jsonb)
  on conflict (key) do nothing;

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
    format('balance of %s pence %s within %s days of sign-off', v_balance,
           case when v_auto then 'due' else 'requested' end, v_days),
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
$function$;

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

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with
  since30 as (select now() - interval '30 days' as t),
  since7  as (select now() - interval '7 days'  as t),
  -- A "job" here is a submission the customer actually confirmed. Drafts and
  -- abandoned parses are funnel leakage, counted separately.
  js as (select * from job_submissions where status not in ('draft','abandoned') and hidden_at is null),
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
     where kind = 'balance' and status in ('due', 'requested', 'failed')
  )
select jsonb_build_object(

  -- ── Funnel ──────────────────────────────────────────────────────────────
  'funnel', jsonb_build_object(
    'landing_views_30d', (select count(*) from landing_views where created_at >= (select t from since30)),
    'started_30d',       (select count(*) from job_submissions where created_at >= (select t from since30) and hidden_at is null),
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
    'awaiting_invoice',          (select count(*) from js where status in ('completed','paid') and contractor_invoice_path is null and not exists (select 1 from contractor_payouts cp where cp.submission_id = js.id)),
    'invoices_to_pay',           (select count(*) from js where status in ('completed','paid') and contractor_invoice_path is not null and not exists (select 1 from contractor_payouts cp where cp.submission_id = js.id))
  ),

  -- ── Money ───────────────────────────────────────────────────────────────
  'money', jsonb_build_object(
    'gross_pence_30d',   (select coalesce(sum(amount_pence),0) from money where paid_at >= (select t from since30)),
    'gross_pence_all',   (select coalesce(sum(amount_pence),0) from money),
    'margin_pence_30d',  (select coalesce(sum(client_price_pence - contractor_price_pence),0) from money where paid_at >= (select t from since30)),
    'margin_pence_all',  (select coalesce(sum(client_price_pence - contractor_price_pence),0) from money),
    'refunded_pence_all',(select coalesce(sum(refunded_pence),0) from money),
    'payouts_owed_pence',(select coalesce(sum(m.contractor_price_pence),0) from money m join js on js.id = m.submission_id where js.status in ('completed','paid') and not exists (select 1 from contractor_payouts cp where cp.submission_id = js.id)),
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
    'invited_30d',  (select count(distinct i.contractor_id) from job_invitations i join js on js.id = i.submission_id where i.sent_at >= (select t from since30)),
    'priced_30d',   (select count(distinct q.contractor_id) from contractor_quotes q join js on js.id = q.submission_id where q.created_at >= (select t from since30)),
    'won_30d',      (select count(distinct awarded_contractor_id) from js where awarded_at >= (select t from since30)),
    'rating_avg',   (select round(avg(stars)::numeric, 2) from contractor_ratings),
    'ratings',      (select count(*) from contractor_ratings)
  ),

  -- ── Response ────────────────────────────────────────────────────────────
  'response', jsonb_build_object(
    'invite_to_first_price_median_hours', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (cq.created_at - i.sent_at))/3600))::numeric, 1)
        from contractor_quotes cq join job_invitations i on i.id = cq.invitation_id
        join js on js.id = cq.submission_id),
    'invites_per_job', (select round(avg(n)::numeric,1) from (select count(*) n from job_invitations i join js on js.id = i.submission_id group by i.submission_id) t),
    'prices_per_job',  (select round(avg(n)::numeric,1) from (select count(*) n from client_quotes c join js on js.id = c.submission_id group by c.submission_id) t),
    'decline_rate_pct',(select case when count(*)=0 then null else round(100.0*count(*) filter (where i.status='declined')/count(*),0) end from job_invitations i join js on js.id = i.submission_id)
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
    'sent_7d',      (select count(*) from pending_emails pe where pe.status='sent' and pe.created_at >= (select t from since7) and not exists (select 1 from pending_emails r where r.retry_of = pe.id)),
    'delivered_7d', (select count(*) from pending_emails pe where pe.delivery_status='delivered' and pe.created_at >= (select t from since7) and not exists (select 1 from pending_emails r where r.retry_of = pe.id)),
    'bounced_7d',   (select count(*) from pending_emails pe where pe.delivery_status in ('bounced','failed','suppressed') and pe.created_at >= (select t from since7) and not exists (select 1 from pending_emails r where r.retry_of = pe.id)),
    'pending',      (select count(*) from pending_emails where status='pending'),
    'failed',       (select count(*) from pending_emails pe where pe.status='failed' and not exists (select 1 from pending_emails r where r.retry_of = pe.id))
  ),

  -- ── The old board, until it is switched off ─────────────────────────────
  'legacy', jsonb_build_object(
    'board_jobs_open', (select count(*) from jobs where status = 'open'),
    'board_jobs_total',(select count(*) from jobs)
  ),

  'generated_at', now()
);
$function$;

CREATE OR REPLACE FUNCTION public.cancel_job_by_client(p_submission_id uuid, p_refund_pence integer, p_fee_pence integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   where submission_id = v_js.id and kind = 'balance' and status in ('due', 'requested', 'failed', 'pending');

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
$function$;

CREATE OR REPLACE FUNCTION public.sq_visit_declined(p_submission_id uuid, p_refund_pence integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_js    job_submissions%rowtype;
  v_email text;
begin
  select * into v_js from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_js.status = 'cancelled' and v_js.visit_status = 'declined' then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;
  if v_js.visit_status is distinct from 'revised' or v_js.status <> 'variation_pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_revised');
  end if;

  update job_submissions
     set status = 'cancelled', visit_status = 'declined', visit_decided_at = now()
   where id = v_js.id;
  perform log_job_event(v_js.id, 'status_change', 'variation_pending', 'cancelled', 'client', null,
    'revised price declined after the site visit; deposit refunded in full',
    jsonb_build_object('refund_pence', p_refund_pence));

  update job_payments set status = 'expired', last_error = 'job cancelled'
   where submission_id = v_js.id and kind = 'balance' and status in ('due', 'requested', 'failed', 'pending');
  update job_payments
     set status = 'refunded', refunded_pence = amount_pence, refunded_at = now()
   where submission_id = v_js.id and kind = 'deposit' and status = 'paid';

  select email into v_email from contractors where id = v_js.awarded_contractor_id;
  if v_email is not null then
    perform sq_notify_once(v_js.id, v_email || ':visit_declined', 'sq_visit_declined', v_email,
      jsonb_build_object('contact_name', v_js.contact_name));
  end if;
  insert into pending_emails (kind, to_email, payload) values ('admin_direct', '__admin__',
    jsonb_build_object(
      'subject', 'Revised price declined — job cancelled and deposit refunded',
      'text', 'The customer on job ' || v_js.id || ' declined the price revised after the site visit. '
        || 'The job is cancelled and ' || round(p_refund_pence / 100.0, 2)
        || E' GBP was refunded to their card.'));
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
  if v_pay.status not in ('due', 'requested', 'failed') then
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
