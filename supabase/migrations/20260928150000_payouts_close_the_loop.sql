-- ════════════════════════════════════════════════════════════════════════
-- A recorded payout closes the job's payout, everywhere.
--
-- contractor_payouts (20260928120000) records payouts, but three places still
-- treated every finished job as unpaid: admin_dashboard's "invoices to pay",
-- "finished, no invoice" and "payouts owed" on /admin/metrics; the
-- invoice chase in send_chase_emails, which would chase a contractor already
-- paid; and the sq_payout_ready view. Each now skips a job with a payout
-- recorded. Bodies are the live definitions with only that filter added.
-- ════════════════════════════════════════════════════════════════════════

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
     where kind = 'balance' and status in ('due', 'failed')
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

CREATE OR REPLACE FUNCTION public.send_chase_emails()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r          record;
  v_email    text;
  v_done_at  timestamptz;
  v_confirm  int := 0;
  v_invoice  int := 0;
  v_nudge1   int := 0;
  v_nudge2   int := 0;
begin
  -- ── 1. Customer has not confirmed ──────────────────────────────────────
  -- Two working days in, one before auto-confirm carries it.
  for r in
    select * from job_submissions
     where status = 'completed_by_contractor'
       and completed_by_contractor_at is not null
       and working_days_since(completed_by_contractor_at) >= 2
       and contact_email is not null
  loop
    begin
      perform sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
        'sq_completion_confirm_chase', r.contact_email,
        jsonb_build_object(
          'client_token', r.client_token,
          'contact_name', r.contact_name,
          'contractor_business_name',
            (select business_name from contractors where id = r.awarded_contractor_id)));
      v_confirm := v_confirm + 1;
    exception when others then
      raise warning 'confirm chase failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ── 2. Contractor has not invoiced ─────────────────────────────────────
  for r in
    select * from job_submissions
     where status in ('completed', 'paid')
       and contractor_invoice_path is null
       and awarded_contractor_id is not null
       and not exists (select 1 from contractor_payouts cp where cp.submission_id = job_submissions.id)
  loop
    begin
      -- When the job actually completed, however it got there: the customer
      -- confirming, auto-confirm, or an operator. A job with no such event is
      -- left alone rather than chased off a guess.
      select max(created_at) into v_done_at
        from job_events
       where job_id = r.id and to_status in ('completed', 'paid');
      continue when v_done_at is null or working_days_since(v_done_at) < 3;

      select email into v_email from contractors where id = r.awarded_contractor_id;
      if v_email is not null then
        perform sq_notify_once(r.id, v_email, 'sq_invoice_chase', v_email,
          jsonb_build_object(
            'contact_name', r.contact_name,
            'service', sq_service_label(r.service_id, r.service_verbatim),
            'postcode_district', split_part(r.postcode, ' ', 1)));
        v_invoice := v_invoice + 1;
      end if;
    exception when others then
      raise warning 'invoice chase failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ── 3 & 4. Customer has prices and has not chosen ──────────────────────
  -- One pass, two thresholds. The status guard is what stops these the moment
  -- a price is taken: accepting moves the job out of quotes_receiving, so an
  -- accepted job can never be nudged even if the cron runs a second later.
  for r in
    select js.*,
           (now()::date - js.quotes_notified_at::date) as days_since,
           -- sq_service_label: the classified name, else the customer's own
           -- words when short enough to read as one, else null — and the
           -- template's own "your job" fallback takes it from there.
           sq_service_label(js.service_id, js.service_verbatim) as service_label,
           (select count(*) from client_quotes cq
             where cq.submission_id = js.id and cq.status = 'active') as quote_count,
           -- The copy says "a N% deposit". Carried in the payload so the email
           -- follows sq_deposit_rate instead of quietly lying if it changes.
           round(app_config_num('sq_deposit_rate', 0.15) * 100)::int as deposit_pct
      from job_submissions js
     where js.status = 'quotes_receiving'
       and js.quotes_notified_at is not null
       and js.contact_email is not null
       and js.accepted_client_quote_id is null
       -- There must actually be a price to chase.
       and exists (select 1 from client_quotes cq
                    where cq.submission_id = js.id and cq.status = 'active')
  loop
    begin
      if r.days_since >= 6 then
        if sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
             'sq_quotes_nudge_2', r.contact_email,
             jsonb_build_object(
               'client_token', r.client_token,
               'contact_name', r.contact_name,
               'service', r.service_label,
               'quote_count', r.quote_count,
               'deposit_pct', r.deposit_pct))
        then v_nudge2 := v_nudge2 + 1; end if;
      end if;

      -- Not elsif: a job first seen at day 7+ should get the fuller day-3 note
      -- as well, since it never received one. sq_notify_once keeps each to one.
      if r.days_since >= 3 then
        if sq_notify_once(r.id, coalesce(r.contact_email, 'unknown'),
             'sq_quotes_nudge_1', r.contact_email,
             jsonb_build_object(
               'client_token', r.client_token,
               'contact_name', r.contact_name,
               'service', r.service_label,
               'quote_count', r.quote_count,
               'deposit_pct', r.deposit_pct))
        then v_nudge1 := v_nudge1 + 1; end if;
      end if;
    exception when others then
      raise warning 'quote nudge failed for %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'confirm_chases', v_confirm,
    'invoice_chases', v_invoice,
    'quote_nudge_day3', v_nudge1,
    'quote_nudge_day6', v_nudge2);
end;
$function$;

create or replace view sq_payout_ready as
SELECT js.id AS submission_id,
    js.awarded_contractor_id AS contractor_id,
    c.business_name,
    c.payout_before_balance,
    cq.contractor_price_pence AS owed_pence,
    js.contractor_invoice_at,
    ( SELECT COALESCE(sum(p.amount_pence), 0::bigint) AS "coalesce"
           FROM job_payments p
          WHERE p.submission_id = js.id AND p.status = 'paid'::text) AS collected_pence,
    ( SELECT clq.client_price_pence
           FROM client_quotes clq
          WHERE clq.id = js.accepted_client_quote_id) AS total_pence,
    js.status
   FROM job_submissions js
     JOIN contractors c ON c.id = js.awarded_contractor_id
     LEFT JOIN contractor_quotes cq ON cq.submission_id = js.id AND cq.contractor_id = js.awarded_contractor_id
  WHERE js.status = ANY (ARRAY['completed'::text, 'paid'::text])
    AND NOT EXISTS (SELECT 1 FROM contractor_payouts cp WHERE cp.submission_id = js.id);
